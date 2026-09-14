require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '1547183159794204675';
const PING_PROTECT_ROLE_ID = process.env.PING_PROTECT_ROLE_ID || '1547183159794204675';
const PREFIX = process.env.PREFIX || '$';
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.RENDER
  ? path.join('/tmp', 'best-bot-data.json')
  : path.join(__dirname, 'data.json');

// Mass ping: 2+ mentions of protected role → 3 day timeout (non-staff)
const MASS_PING_LIMIT = 2;
const MASS_PING_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Bad words — message deleted + warn (guild owner exempt; co-owners NOT exempt)
const BAD_WORDS = ['fuck', 'scam', 'fucker', 'fucking', 'scammer', 'scamming'];

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN');
  process.exit(1);
}

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Best bot is online');
  })
  .listen(PORT, '0.0.0.0', () => console.log(`HTTP health server on port ${PORT}`));

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const d = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      if (!d.messages) d.messages = {};
      if (!d.invites) d.invites = {};
      if (!d.inviteUses) d.inviteUses = {};
      if (!Array.isArray(d.mcfaStock)) d.mcfaStock = [];
      if (!Array.isArray(d.mcfaUsed)) d.mcfaUsed = [];
      if (!d.warns) d.warns = {};
      return d;
    }
  } catch (e) {
    console.error('Load error:', e.message);
  }
  return {
    messages: {},
    invites: {},
    inviteUses: {},
    mcfaStock: [],
    mcfaUsed: [],
    warns: {}
  };
}

function saveData() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Save error:', e.message);
  }
}

let data = loadData();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel]
});

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) return true;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return false;
}

function isGuildOwner(member, guild) {
  return member && guild && member.id === guild.ownerId;
}

function addWarn(guildId, userId, reason) {
  if (!data.warns[guildId]) data.warns[guildId] = {};
  if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];
  data.warns[guildId][userId].push({ reason, at: new Date().toISOString() });
  saveData();
  return data.warns[guildId][userId].length;
}

function parseAccounts(text) {
  const cleaned = text
    .replace(/\|\|/g, ' ')
    .replace(/,/g, '\n')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const item of cleaned) {
    if (!item.includes(':')) continue;
    const idx = item.indexOf(':');
    if (idx <= 0) continue;
    const mail = item.slice(0, idx).trim();
    const pass = item.slice(idx + 1).trim();
    if (mail && pass) out.push(`${mail}:${pass}`);
  }
  return out;
}

function addMessage(guildId, userId) {
  if (!data.messages[guildId]) data.messages[guildId] = {};
  data.messages[guildId][userId] = (data.messages[guildId][userId] || 0) + 1;
  saveData();
}

function findBadWord(content) {
  const lower = content.toLowerCase();
  for (const w of BAD_WORDS) {
    // word boundary-ish match
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) return w;
  }
  return null;
}

function countProtectedRolePings(message) {
  let count = 0;
  // Role mentions
  for (const [id] of message.mentions.roles) {
    if (id === PING_PROTECT_ROLE_ID) count++;
  }
  // Raw <@&id> in content (in case of duplicates)
  const re = new RegExp(`<@&${PING_PROTECT_ROLE_ID}>`, 'g');
  const raw = message.content.match(re);
  if (raw && raw.length > count) count = raw.length;
  return count;
}

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    if (!data.inviteUses[guild.id]) data.inviteUses[guild.id] = {};
    invites.forEach((inv) => {
      data.inviteUses[guild.id][inv.code] = {
        uses: inv.uses || 0,
        inviterId: inv.inviter?.id || null
      };
    });
    saveData();
  } catch (e) {
    console.error('Invite cache failed:', e.message);
  }
}

async function onReady() {
  console.log(`Logged in as ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    await cacheGuildInvites(guild);
  }
  setInterval(() => saveData(), 60_000);
}

client.once('ready', onReady);
client.once('clientReady', onReady);

client.on('inviteCreate', async (invite) => {
  try {
    if (!data.inviteUses[invite.guild.id]) data.inviteUses[invite.guild.id] = {};
    data.inviteUses[invite.guild.id][invite.code] = {
      uses: invite.uses || 0,
      inviterId: invite.inviter?.id || null
    };
    saveData();
  } catch (_) {}
});

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;
  try {
    const invites = await guild.invites.fetch();
    const previous = data.inviteUses[guild.id] || {};
    let used = null;
    invites.forEach((inv) => {
      const before = previous[inv.code]?.uses || 0;
      if ((inv.uses || 0) > before) used = inv;
    });
    data.inviteUses[guild.id] = {};
    invites.forEach((inv) => {
      data.inviteUses[guild.id][inv.code] = {
        uses: inv.uses || 0,
        inviterId: inv.inviter?.id || null
      };
    });
    if (used && used.inviter) {
      const gid = guild.id;
      const uid = used.inviter.id;
      if (!data.invites[gid]) data.invites[gid] = {};
      data.invites[gid][uid] = (data.invites[gid][uid] || 0) + 1;
    }
    saveData();
  } catch (e) {
    console.error('guildMemberAdd invite track:', e.message);
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const member = message.member;
  if (!member) return;

  // ===== Auto-mod: mass ping protected role =====
  // Staff exempt. 2+ pings of role → 3 day timeout + delete
  if (!isStaff(member)) {
    const pingCount = countProtectedRolePings(message);
    if (pingCount >= MASS_PING_LIMIT) {
      try {
        await message.delete().catch(() => null);
        await member.timeout(
          MASS_PING_TIMEOUT_MS,
          `Mass ping of protected role (${pingCount}x)`
        );
        const warnN = addWarn(
          message.guild.id,
          member.id,
          `Mass ping x${pingCount} of role ${PING_PROTECT_ROLE_ID}`
        );
        await message.channel.send(
          `${member} timed out **3 days** for mass pinging staff (${pingCount}x). Warn #${warnN}`
        );
      } catch (e) {
        console.error('Mass ping punish failed:', e.message);
        await message.channel
          .send(
            `Could not timeout ${member} (need **Timeout Members** + role higher than them).`
          )
          .catch(() => null);
      }
      return;
    }
  }

  // ===== Auto-mod: bad words (fuck, scam, ...) =====
  // Only true server OWNER is exempt. Co-owners / staff still warned.
  if (!isGuildOwner(member, message.guild)) {
    const hit = findBadWord(message.content);
    if (hit) {
      try {
        await message.delete().catch(() => null);
        const warnN = addWarn(message.guild.id, member.id, `Bad word: ${hit}`);
        await message.channel.send(
          `${member} warned for banned word (**${hit}**). Message deleted. Warn #${warnN}`
        );
      } catch (e) {
        console.error('Bad word punish failed:', e.message);
      }
      return;
    }
  }

  addMessage(message.guild.id, message.author.id);

  if (!message.content.startsWith(PREFIX)) return;

  const body = message.content.slice(PREFIX.length).trim();
  const args = body.split(/\s+/);
  const cmd = (args.shift() || '').toLowerCase();
  if (!cmd) return;

  // ========== $best @role ==========
  if (cmd === 'best') {
    if (!isStaff(member)) return message.reply('Staff only.');

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get((args[0] || '').replace(/[<@&>]/g, ''));

    if (!role) return message.reply('Usage: `$best @role`');

    try {
      await message.guild.members.fetch();
    } catch (_) {}

    const membersWithRole = message.guild.members.cache.filter(
      (m) => !m.user.bot && m.roles.cache.has(role.id)
    );

    if (!membersWithRole.size) {
      return message.reply(`No members found with role **${role.name}**.`);
    }

    const ranked = [...membersWithRole.values()]
      .map((m) => {
        const messages = data.messages[message.guild.id]?.[m.id] || 0;
        const invites = data.invites[message.guild.id]?.[m.id] || 0;
        const score = messages + invites * 25;
        return { m, messages, invites, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    const lines = ranked.map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
      return `${medal} ${r.m} — **${r.score}** pts · 💬 ${r.messages} · 🎟️ ${r.invites}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xe8c84a)
      .setTitle(`Best in @${role.name}`)
      .setDescription(lines.join('\n') || 'No data yet.')
      .setFooter({ text: 'Score = messages + (invites × 25)' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ========== $mcfa / $stock ==========
  if (cmd === 'mcfa' || cmd === 'stock') {
    if (!isStaff(member)) return message.reply('Staff only.');

    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'count' || sub === 'left') {
      return message.reply(
        `MCFA stock: **${data.mcfaStock.length}** available · **${data.mcfaUsed.length}** delivered`
      );
    }

    if (sub === 'list' || sub === 'paste') {
      if (!data.mcfaStock.length) {
        return message.reply('No MCFA stock left. Add with `$mcfa add mail:pass`');
      }
      const spoilers = data.mcfaStock.map((a) => `||${a}||`);
      const chunks = [];
      let buf = `**MCFA stock (${data.mcfaStock.length})**\n`;
      for (const s of spoilers) {
        if ((buf + s + '\n').length > 1900) {
          chunks.push(buf);
          buf = '';
        }
        buf += s + '\n';
      }
      if (buf.trim()) chunks.push(buf);
      for (const c of chunks) await message.channel.send(c);
      return;
    }

    if (sub === 'add') {
      const rest = body.slice(body.toLowerCase().indexOf('add') + 3).trim();
      const accounts = parseAccounts(rest);
      if (!accounts.length) {
        return message.reply(
          'Usage:\n`$mcfa add mail:pass`\n`$mcfa add mail:pass mail:pass`'
        );
      }
      let added = 0;
      for (const a of accounts) {
        if (!data.mcfaStock.includes(a)) {
          data.mcfaStock.push(a);
          added++;
        }
      }
      saveData();
      return message.reply(`Added **${added}** MCFA · Stock now **${data.mcfaStock.length}**`);
    }

    if (sub === 'clear') {
      const n = data.mcfaStock.length;
      data.mcfaStock = [];
      saveData();
      return message.reply(`Cleared **${n}** from stock.`);
    }

    return message.reply(
      '`$mcfa` · `$mcfa list` · `$mcfa add mail:pass` · `$pay @user`'
    );
  }

  // ========== $pay @user ==========
  if (cmd === 'pay') {
    if (!isStaff(member)) return message.reply('Staff only.');

    const user =
      message.mentions.users.first() ||
      (args[0] &&
        (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));

    if (!user || user.bot) {
      return message.reply('Usage: `$pay @user` — sends 1 MCFA to their DM');
    }

    if (!data.mcfaStock.length) {
      return message.reply('No MCFA stock left. Add with `$mcfa add mail:pass`');
    }

    const account = data.mcfaStock.shift();
    data.mcfaUsed.push({
      account,
      to: user.id,
      by: message.author.id,
      at: new Date().toISOString()
    });
    saveData();

    try {
      await user.send(
        `**Ultimate Reward — MCFA delivery**\n` +
          `Here is your account (click to reveal):\n||${account}||\n\n` +
          `Delivered by staff. Do not share.`
      );
      return message.reply(
        `Paid **1 MCFA** to ${user} via DM · Stock left: **${data.mcfaStock.length}**`
      );
    } catch (e) {
      data.mcfaStock.unshift(account);
      data.mcfaUsed.pop();
      saveData();
      return message.reply(
        `Could not DM ${user} (DMs closed). Account was **not** taken from stock.`
      );
    }
  }

  // ========== $warns @user (staff) ==========
  
  // ========== $format email:pass (format only — NO login) ==========
  if (cmd === 'format' || cmd === 'emailcheck') {
    if (!isStaff(member)) return message.reply('Staff only.');

    const rest = body.slice(cmd.length).trim();
    if (!rest) {
      return message.reply(
        'Usage:\n`$format email:pass`\n`$format email:pass email:pass`\n(multiple lines OK)\n\n' +
          'Checks **format + domain only** (no login).'
      );
    }

    const accounts = parseAccounts(rest);
    if (!accounts.length) {
      return message.reply('No `email:pass` found. Example: `$format user@outlook.com:Pass123!`');
    }

    const allowed = new Set([
      // Microsoft
      'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'passport.com',
      'outlook.in', 'hotmail.co.uk', 'live.co.uk', 'outlook.co.uk',
      // Google
      'gmail.com', 'googlemail.com',
      // Common others often used
      'yahoo.com', 'yahoo.co.in', 'icloud.com', 'proton.me', 'protonmail.com'
    ]);

    function emailFormatOk(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    function domainOf(email) {
      const i = email.lastIndexOf('@');
      return i >= 0 ? email.slice(i + 1).toLowerCase() : '';
    }
    function passNotes(pass) {
      const notes = [];
      if (pass.length >= 8) notes.push('length 8+');
      else notes.push('short (<8)');
      if (/[A-Z]/.test(pass)) notes.push('uppercase');
      if (/[a-z]/.test(pass)) notes.push('lowercase');
      if (/[0-9]/.test(pass)) notes.push('number');
      if (/[^A-Za-z0-9]/.test(pass)) notes.push('symbol');
      return notes.join(', ');
    }

    const valid = [];
    const invalid = [];

    for (const acc of accounts) {
      const idx = acc.indexOf(':');
      const email = acc.slice(0, idx);
      const pass = acc.slice(idx + 1);
      const domain = domainOf(email);
      const fmt = emailFormatOk(email);
      const domOk = allowed.has(domain);
      const passOk = pass.length >= 8;

      const block =
        `📧 **Email Check**\n` +
        `Email: \`${email}\`\n` +
        `Password: \`••••••••\`\n` +
        `─────────────\n` +
        `${fmt ? '✅' : '❌'} Email format: ${fmt ? 'Valid' : 'Invalid'}\n` +
        `${domOk ? '✅' : '❌'} Domain: ${domain || '—'}${domOk ? '' : ' (not allowed)'}\n` +
        `${passOk ? '✅' : '⚠️'} Password length: ${passOk ? 'OK (8+)' : 'Too short'}\n` +
        `⚠️ Notes: ${passNotes(pass)}\n` +
        `─────────────\n` +
        `Status: **${fmt && domOk ? 'Looks valid' : 'Invalid / skipped'}**`;

      if (fmt && domOk) valid.push({ email, pass, block });
      else invalid.push({ email, block });
    }

    // Summary
    await message.reply(
      `Checked **${accounts.length}** · ✅ valid format/domain: **${valid.length}** · ❌ skipped: **${invalid.length}**`
    );

    // Valid only — clean, password hidden in channel; optional spoiler for staff
    for (const v of valid.slice(0, 15)) {
      await message.channel.send(
        v.block + `\nReveal: ||${v.email}:${v.pass}||`
      );
    }
    if (valid.length > 15) {
      await message.channel.send(`…and **${valid.length - 15}** more valid (showing first 15).`);
    }
    if (invalid.length && invalid.length <= 10) {
      await message.channel.send(
        '**Skipped (invalid format/domain):**\n' +
          invalid.map((x) => `• \`${x.email}\``).join('\n')
      );
    }
    return;
  }


  if (cmd === 'warns') {
    if (!isStaff(member)) return message.reply('Staff only.');
    const user =
      message.mentions.users.first() ||
      (args[0] &&
        (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));
    if (!user) return message.reply('Usage: `$warns @user`');
    const list = data.warns[message.guild.id]?.[user.id] || [];
    if (!list.length) return message.reply(`${user} has **0** warns.`);
    const lines = list
      .slice(-10)
      .map((w, i) => `${i + 1}. ${w.reason} · ${new Date(w.at).toLocaleString()}`);
    return message.reply(`Warns for ${user} (**${list.length}**):\n${lines.join('\n')}`);
  }
});

client.login(TOKEN);
