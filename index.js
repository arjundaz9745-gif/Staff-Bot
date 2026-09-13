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
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '';
const PREFIX = process.env.PREFIX || '$';
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.RENDER
  ? path.join('/tmp', 'best-bot-data.json')
  : path.join(__dirname, 'data.json');

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
      if (!Array.isArray(d.customStock)) d.customStock = [];
      if (!Array.isArray(d.customUsed)) d.customUsed = [];
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
    customStock: [],
    customUsed: []
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
    GatewayIntentBits.GuildPresences
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

function parseAccounts(text) {
  // Accept: mail:pass | mail:pass,mail:pass | one per line | with ||spoilers||
  const cleaned = text
    .replace(/\|\|/g, ' ')
    .replace(/,/g, '\n')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const item of cleaned) {
    if (!item.includes(':')) continue;
    // basic mail:pass (allow extra colons in pass)
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

  addMessage(message.guild.id, message.author.id);

  if (!message.content.startsWith(PREFIX)) return;

  const body = message.content.slice(PREFIX.length).trim();
  const args = body.split(/\s+/);
  const cmd = (args.shift() || '').toLowerCase();
  if (!cmd) return;

  // ========== $best @role ==========
  if (cmd === 'best') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get((args[0] || '').replace(/[<@&>]/g, ''));

    if (!role) {
      return message.reply('Usage: `$best @role`');
    }

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
  // $mcfa              → show stock count (staff)
  // $mcfa list         → paste available as ||mail:pass|| (staff, in channel)
  // $mcfa add ...      → add accounts (staff)
  // $stock ...         → same aliases
  if (cmd === 'mcfa' || cmd === 'stock') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

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
      // Discord message limit ~2000 — batch
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
      for (const c of chunks) {
        await message.channel.send(c);
      }
      return;
    }

    if (sub === 'add') {
      const rest = body.slice(body.toLowerCase().indexOf('add') + 3).trim();
      const accounts = parseAccounts(rest);
      if (!accounts.length) {
        return message.reply(
          'Usage:\n`$mcfa add mail:pass`\n`$mcfa add mail:pass mail:pass`\nOr multiple lines after add'
        );
      }
      // avoid exact duplicates still in stock
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
      'MCFA commands (staff):\n' +
        '`$mcfa` — stock count\n' +
        '`$mcfa list` — paste all as ||mail:pass||\n' +
        '`$mcfa add mail:pass` — add stock\n' +
        '`$mcfa clear` / `$clear` — clear stock\n' +
        '`$pay @user` — DM one MCFA to user\n' +
        '`$salary @user` — DM staff salary reward (restricted)'
    );
  }

  // ========== $pay @user ==========
  if (cmd === 'pay') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));

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
      // DM closed — put account back
      data.mcfaStock.unshift(account);
      data.mcfaUsed.pop();
      saveData();
      return message.reply(
        `Could not DM ${user} (DMs closed). Account was **not** taken from stock.`
      );
    }
  }

  // ========== $salary @user ==========
  // Only usable by user ID 1398979148063571989 or members with role 1547183159794204675
  if (cmd === 'salary') {
    const ALLOWED_USER_ID = '1398979148063571989';
    const ALLOWED_ROLE_ID = '1547183159794204675';

    const isAllowed =
      message.author.id === ALLOWED_USER_ID ||
      (message.member && message.member.roles.cache.has(ALLOWED_ROLE_ID));

    if (!isAllowed) {
      return message.reply('You do not have permission to use this command.');
    }

    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));

    if (!user || user.bot) {
      return message.reply('Usage: `$salary @user` — DMs staff salary reward');
    }

    if (!data.mcfaStock.length) {
      return message.reply('No MCFA stock left. Add with `$mcfa add mail:pass`');
    }

    const account = data.mcfaStock.shift();
    data.mcfaUsed.push({
      account,
      to: user.id,
      by: message.author.id,
      at: new Date().toISOString(),
      type: 'salary'
    });
    saveData();

    const salaryMsg =
      `# 💰 Staff Salary\n\n` +
      `Your staff reward for this month:\n\n` +
      `« Reward: ||${account}|| »\n\n` +
      `Thank you for your hard work and dedication to Ultimate Rewards! 🫡\n` +
      `Keep up the great work! 🚀`;

    try {
      await user.send(salaryMsg);
      return message.reply(
        `Sent **Staff Salary** to ${user} via DM · Stock left: **${data.mcfaStock.length}**`
      );
    } catch (e) {
      // DM closed — put account back
      data.mcfaStock.unshift(account);
      data.mcfaUsed.pop();
      saveData();
      return message.reply(
        `Could not DM ${user} (DMs closed). Account was **not** taken from stock.`
      );
    }
  }

  // ========== $clear ==========
  // Shortcut to clear MCFA stock
  if (cmd === 'clear') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const n = data.mcfaStock.length;
    data.mcfaStock = [];
    saveData();
    return message.reply(`Cleared **${n}** from MCFA stock.`);
  }

  // ========== $online @role ==========
  if (cmd === 'online') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get((args[0] || '').replace(/[<@&>]/g, ''));

    if (!role) {
      return message.reply('Usage: `$online @role`');
    }

    try {
      await message.guild.members.fetch();
    } catch (_) {}

    const onlineMembers = message.guild.members.cache.filter(
      (m) =>
        !m.user.bot &&
        m.roles.cache.has(role.id) &&
        m.presence &&
        ['online', 'idle', 'dnd'].includes(m.presence.status)
    );

    if (!onlineMembers.size) {
      return message.reply(`No online members found with role **${role.name}**.`);
    }

    const lines = [...onlineMembers.values()]
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((m) => {
        const status = m.presence?.status || 'unknown';
        const emoji = status === 'online' ? '🟢' : status === 'idle' ? '🟡' : '🔴';
        return `${emoji} ${m} (\`${status}\`)`;
      });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`Online in @${role.name}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${onlineMembers.size} online` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ========== $custom (custom stock system) ==========
  if (cmd === 'custom') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'count' || sub === 'left') {
      return message.reply(
        `Custom stock: **${data.customStock.length}** available · **${data.customUsed.length}** delivered`
      );
    }

    if (sub === 'list' || sub === 'paste') {
      if (!data.customStock.length) {
        return message.reply('No custom stock left. Add with `$custom add <text>`');
      }
      const spoilers = data.customStock.map((a) => `||${a}||`);
      const chunks = [];
      let buf = `**Custom stock (${data.customStock.length})**\n`;
      for (const s of spoilers) {
        if ((buf + s + '\n').length > 1900) {
          chunks.push(buf);
          buf = '';
        }
        buf += s + '\n';
      }
      if (buf.trim()) chunks.push(buf);
      for (const c of chunks) {
        await message.channel.send(c);
      }
      return;
    }

    if (sub === 'add') {
      const rest = body.slice(body.toLowerCase().indexOf('add') + 3).trim();
      if (!rest) {
        return message.reply('Usage: `$custom add <any text>`');
      }
      // allow multiple lines / items separated by newlines
      const items = rest
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      let added = 0;
      for (const item of items) {
        if (!data.customStock.includes(item)) {
          data.customStock.push(item);
          added++;
        }
      }
      saveData();
      return message.reply(`Added **${added}** custom item(s) · Stock now **${data.customStock.length}**`);
    }

    if (sub === 'clear') {
      const n = data.customStock.length;
      data.customStock = [];
      saveData();
      return message.reply(`Cleared **${n}** from custom stock.`);
    }

    return message.reply(
      'Custom commands (staff):\n' +
        '`$custom` — stock count\n' +
        '`$custom list` — paste all as spoilers\n' +
        '`$custom add <text>` — add item(s)\n' +
        '`$custom clear` — clear custom stock\n' +
        '`$custompay @user` — DM one custom item to user'
    );
  }

  // ========== $custompay @user ==========
  if (cmd === 'custompay') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));

    if (!user || user.bot) {
      return message.reply('Usage: `$custompay @user` — sends 1 custom item to their DM');
    }

    if (!data.customStock.length) {
      return message.reply('No custom stock left. Add with `$custom add <text>`');
    }

    const item = data.customStock.shift();
    data.customUsed.push({
      item,
      to: user.id,
      by: message.author.id,
      at: new Date().toISOString()
    });
    saveData();

    try {
      await user.send(
        `**Custom delivery**\n` +
          `Here is your item (click to reveal):\n||${item}||\n\n` +
          `Delivered by staff.`
      );
      return message.reply(
        `Sent **1 custom item** to ${user} via DM · Stock left: **${data.customStock.length}**`
      );
    } catch (e) {
      data.customStock.unshift(item);
      data.customUsed.pop();
      saveData();
      return message.reply(
        `Could not DM ${user} (DMs closed). Item was **not** taken from stock.`
      );
    }
  }

  // ========== $help ==========
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Staff Bot — Commands')
      .setDescription(
        [
          '**Leaderboard**',
          '`$best @role` — top members by messages + invites',
          '',
          '**MCFA Stock**',
          '`$mcfa` / `$stock` — stock count',
          '`$mcfa list` — show all accounts',
          '`$mcfa add mail:pass` — add accounts',
          '`$mcfa clear` or `$clear` — clear MCFA stock',
          '`$pay @user` — DM 1 MCFA account',
          '',
          '**Salary**',
          '`$salary @user` — DM staff salary reward *(restricted)*',
          '',
          '**Custom Stock**',
          '`$custom` — custom stock count',
          '`$custom list` — show all custom items',
          '`$custom add <text>` — add custom item(s)',
          '`$custom clear` — clear custom stock',
          '`$custompay @user` — DM 1 custom item',
          '',
          '**Other**',
          '`$online @role` — show online members in a role',
          '`$help` — this message'
        ].join('\n')
      )
      .setFooter({ text: 'Most commands are staff-only' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

});

client.login(TOKEN);
