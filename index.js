require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '';
const PREFIX = process.env.PREFIX || '$';
const PORT = process.env.PORT || 3000;

// Staff role hierarchy for $staffstats (highest first)
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || '1547183159794204675';
const CO_OWNER_ROLE_ID = process.env.CO_OWNER_ROLE_ID || '1547183161300090950';
const HEAD_ADMIN_ROLE_ID = process.env.HEAD_ADMIN_ROLE_ID || '1547183162457718847';
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || '1547183164185911356';
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
      if (!d.coins) d.coins = {};
      if (!d.daily) d.daily = {};
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
    customUsed: [],
    coins: {},
    daily: {}
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

function isCoOwnerOrAbove(member) {
  if (!member) return false;
  if (OWNER_ROLE_ID && member.roles.cache.has(OWNER_ROLE_ID)) return true;
  if (CO_OWNER_ROLE_ID && member.roles.cache.has(CO_OWNER_ROLE_ID)) return true;
  return false;
}

function getCoins(userId) {
  return data.coins[userId] || 0;
}

function setCoins(userId, amount) {
  data.coins[userId] = Math.max(0, Math.floor(amount));
  saveData();
}

function addCoins(userId, amount) {
  setCoins(userId, getCoins(userId) + amount);
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
        '`$custompay @user` — DM 1 item to one user\n' +
        '`$custompay @role` — DM 1 item to every member in the role'
    );
  }

  // ========== $custompay @user  OR  $custompay @role ==========
  // If a role is given → sends 1 item to EVERY member in that role
  if (cmd === 'custompay') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    // Prefer role if mentioned, otherwise try user
    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get((args[0] || '').replace(/[<@&>]/g, ''));

    const user =
      !role
        ? message.mentions.users.first() ||
          (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)))
        : null;

    // ---------- ROLE MODE ----------
    if (role) {
      try {
        await message.guild.members.fetch();
      } catch (_) {}

      const targets = message.guild.members.cache.filter(
        (m) => !m.user.bot && m.roles.cache.has(role.id)
      );

      if (!targets.size) {
        return message.reply(`No members found with role **${role.name}**.`);
      }

      if (data.customStock.length < targets.size) {
        return message.reply(
          `Not enough custom stock. Need **${targets.size}** items, only **${data.customStock.length}** left.`
        );
      }

      let sent = 0;
      let failed = 0;

      for (const [, member] of targets) {
        const item = data.customStock.shift();
        data.customUsed.push({
          item,
          to: member.id,
          by: message.author.id,
          at: new Date().toISOString(),
          role: role.id
        });

        try {
          await member.send(
            `**Custom delivery**\n` +
              `Here is your item (click to reveal):\n||${item}||\n\n` +
              `Delivered by staff.`
          );
          sent++;
        } catch (e) {
          // put item back if DM failed
          data.customStock.unshift(item);
          data.customUsed.pop();
          failed++;
        }
      }

      saveData();
      return message.reply(
        `Role **@${role.name}**: sent to **${sent}** members` +
          (failed ? ` · **${failed}** failed (DMs closed)` : '') +
          ` · Stock left: **${data.customStock.length}**`
      );
    }

    // ---------- USER MODE ----------
    if (!user || user.bot) {
      return message.reply(
        'Usage:\n`$custompay @user` — send 1 item to one user\n`$custompay @role` — send 1 item to every member in the role'
      );
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


  // ========== $ultimate (economy) ==========
  // $ultimate                 → show your balance
  // $ultimate @user           → show someone's balance
  // $ultimate add <amt> [@user] → add coins (Owner/Co-Owner)
  // $ultimate give/send @user <amt> → transfer coins
  // $ultimate cf <amt> <head|tail> → coin flip
  // $ultimate daily           → claim daily reward
  // $ultimate top             → richest users
  if (cmd === 'ultimate') {
    const sub = (args[0] || '').toLowerCase();

    // ---- $ultimate add <amount> [@user] ----
    if (sub === 'add') {
      if (!isCoOwnerOrAbove(message.member)) {
        return message.reply('Only **Owner** and **Co-Owner** can add coins.');
      }
      const amount = parseInt(args[1], 10);
      if (!amount || amount < 1) {
        return message.reply('Usage: `$ultimate add <amount> [@user]`');
      }
      let target = message.mentions.users.first();
      if (!target && args[2]) {
        target = await client.users.fetch(args[2].replace(/[<@!>]/g, '')).catch(() => null);
      }
      if (!target) target = message.author;
      if (target.bot) return message.reply('Cannot add coins to bots.');

      addCoins(target.id, amount);
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('💰 Coins Added')
        .setDescription(
          `Added **${amount.toLocaleString()}** coins to **${target.username}**\n` +
          `New balance: **${getCoins(target.id).toLocaleString()}** 🪙`
        )
        .setFooter({ text: 'Ultimate Rewards' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ---- $ultimate give / send @user <amount> ----
    if (sub === 'give' || sub === 'send') {
      const target =
        message.mentions.users.first() ||
        (args[1] && (await client.users.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null)));

      // amount can be args[1] or args[2] depending on whether mention is used
      let amount = parseInt(args[1], 10);
      if (message.mentions.users.first()) {
        amount = parseInt(args[1], 10); // $ultimate give @user 100  → args = ['give', '100'] after shift? 
        // actually after cmd shift, args[0]=give, args[1]=maybe id or amount
      }
      // Better parse: find the number in remaining args
      const numArg = args.find((a) => /^\d+$/.test(a));
      amount = numArg ? parseInt(numArg, 10) : NaN;

      if (!target || target.bot) {
        return message.reply('Usage: `$ultimate give @user <amount>`');
      }
      if (!amount || amount < 1) {
        return message.reply('Usage: `$ultimate give @user <amount>`');
      }
      if (target.id === message.author.id) {
        return message.reply("You can't give coins to yourself.");
      }

      const bal = getCoins(message.author.id);
      if (amount > bal) {
        return message.reply(`You only have **${bal.toLocaleString()}** coins.`);
      }

      addCoins(message.author.id, -amount);
      addCoins(target.id, amount);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('💸 Coins Sent')
        .setDescription(
          `**${message.author.username}** gave **${amount.toLocaleString()}** coins to **${target.username}**\n\n` +
          `Your new balance: **${getCoins(message.author.id).toLocaleString()}** 🪙`
        )
        .setFooter({ text: 'Ultimate Rewards' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ---- $ultimate cf <amount> <head|tail> ----
    if (sub === 'cf' || sub === 'coinflip') {
      const amount = parseInt(args[1], 10);
      const choice = (args[2] || '').toLowerCase();

      if (!amount || amount < 1) {
        return message.reply('Usage: `$ultimate cf <amount> <head|tail>`');
      }
      if (!['head', 'heads', 'h', 'tail', 'tails', 't'].includes(choice)) {
        return message.reply('Choose **head** or **tail**.\nExample: `$ultimate cf 100 head`');
      }

      const bal = getCoins(message.author.id);
      if (amount > bal) {
        return message.reply(`You only have **${bal.toLocaleString()}** coins.`);
      }

      const normalized = ['head', 'heads', 'h'].includes(choice) ? 'head' : 'tail';
      const result = Math.random() < 0.5 ? 'head' : 'tail';
      const won = normalized === result;

      if (won) addCoins(message.author.id, amount);
      else addCoins(message.author.id, -amount);

      const embed = new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle(won ? '🎉 You won!' : '💀 You lost...')
        .setDescription(
          `You chose **${normalized}**\n` +
          `The coin landed on **${result}**\n\n` +
          (won
            ? `You won **${amount.toLocaleString()}** coins!`
            : `You lost **${amount.toLocaleString()}** coins.`) +
          `\n\nNew balance: **${getCoins(message.author.id).toLocaleString()}** 🪙`
        )
        .setFooter({ text: 'Ultimate Rewards • Coin Flip' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ---- $ultimate daily ----
    if (sub === 'daily') {
      const uid = message.author.id;
      const now = Date.now();
      const last = data.daily[uid] || 0;
      const cooldown = 24 * 60 * 60 * 1000; // 24h

      if (now - last < cooldown) {
        const left = cooldown - (now - last);
        const h = Math.floor(left / 3600000);
        const m = Math.floor((left % 3600000) / 60000);
        return message.reply(`Daily already claimed. Come back in **${h}h ${m}m**.`);
      }

      const reward = 500 + Math.floor(Math.random() * 501); // 500–1000
      data.daily[uid] = now;
      addCoins(uid, reward);

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🎁 Daily Reward')
        .setDescription(
          `You claimed **${reward.toLocaleString()}** coins!\n` +
          `New balance: **${getCoins(uid).toLocaleString()}** 🪙`
        )
        .setFooter({ text: 'Ultimate Rewards • Resets in 24h' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ---- $ultimate top ----
    if (sub === 'top' || sub === 'lb' || sub === 'leaderboard') {
      const entries = Object.entries(data.coins || {})
        .map(([id, bal]) => ({ id, bal: bal || 0 }))
        .filter((e) => e.bal > 0)
        .sort((a, b) => b.bal - a.bal)
        .slice(0, 10);

      if (!entries.length) {
        return message.reply('No one has any coins yet.');
      }

      const lines = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        let name = e.id;
        try {
          const u = await client.users.fetch(e.id);
          name = u.username;
        } catch (_) {}
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
        lines.push(`${medal} **${name}** — ${e.bal.toLocaleString()} 🪙`);
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🏆 Ultimate Richest')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Ultimate Rewards' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ---- $ultimate  or  $ultimate @user  → show balance ----
    let target = message.mentions.users.first();
    if (!target && args[0] && !['add', 'cf', 'coinflip', 'give', 'send', 'daily', 'top', 'lb', 'leaderboard'].includes(sub)) {
      target = await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
    }
    if (!target) target = message.author;

    const bal = getCoins(target.id);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🪙 Ultimate Balance')
      .setDescription(
        target.id === message.author.id
          ? `You have **${bal.toLocaleString()}** coins.`
          : `**${target.username}** has **${bal.toLocaleString()}** coins.`
      )
      .setFooter({ text: 'Ultimate Rewards' })
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // ========== $staffstats ==========
  if (cmd === 'staffstats') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    // Role hierarchy (highest priority first) — members appear only under their highest role
    const staffRoleConfig = [
      { id: OWNER_ROLE_ID, label: '👑 Owner', key: 'owner' },
      { id: CO_OWNER_ROLE_ID, label: '💎 Co-Owner', key: 'coowner' },
      { id: HEAD_ADMIN_ROLE_ID, label: '🛡️ Head Admin', key: 'headadmin' },
      { id: ADMIN_ROLE_ID, label: '⚔️ Admin', key: 'admin' }
    ].filter((r) => r.id); // only keep configured ones

    if (!staffRoleConfig.length) {
      return message.reply(
        'No staff roles configured.\n' +
          'Set `OWNER_ROLE_ID`, `CO_OWNER_ROLE_ID`, `HEAD_ADMIN_ROLE_ID`, `ADMIN_ROLE_ID` in your environment.'
      );
    }

    try {
      await message.guild.members.fetch();
    } catch (_) {}

    // Map: key → array of clean display names
    const groups = {};
    const counted = new Set(); // prevent duplicates across roles
    let totalStaff = 0;
    let onlineCount = 0;
    let offlineCount = 0;

    for (const cfg of staffRoleConfig) {
      groups[cfg.key] = [];
      const role = message.guild.roles.cache.get(cfg.id);
      if (!role) continue;

      for (const [, member] of role.members) {
        if (member.user.bot) continue;
        if (counted.has(member.id)) continue; // already listed under higher role
        counted.add(member.id);

        const name = member.displayName || member.user.username;
        groups[cfg.key].push(name);
        totalStaff++;

        const status = member.presence?.status;
        if (status && ['online', 'idle', 'dnd'].includes(status)) {
          onlineCount++;
        } else {
          offlineCount++;
        }
      }
    }

    // Build description sections
    const sections = [];
    for (const cfg of staffRoleConfig) {
      const role = message.guild.roles.cache.get(cfg.id);
      if (!role) continue;
      const names = groups[cfg.key] || [];
      if (!names.length) {
        sections.push(`**${cfg.label}**\n• —`);
      } else {
        sections.push(`**${cfg.label}**\n${names.map((n) => `• ${n}`).join('\n')}`);
      }
    }

    // Role counts line
    const roleCounts = staffRoleConfig
      .map((cfg) => {
        const role = message.guild.roles.cache.get(cfg.id);
        if (!role) return null;
        const count = (groups[cfg.key] || []).length;
        return `• ${role.name}: ${count}`;
      })
      .filter(Boolean)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle('🛡️ STAFF STATS')
      .setDescription(
        [
          '```',
          '╭───────────────╮',
          '  STAFF TEAM',
          '╰───────────────╯',
          '```',
          '',
          sections.join('\n\n'),
          '',
          '━━━━━━━━━━━━━━━━━━━━',
          '',
          '**SERVER STAFF OVERVIEW**',
          `👥 Total Staff: **${totalStaff}**`,
          `🟢 Currently Online: **${onlineCount}**`,
          `⚫ Currently Offline: **${offlineCount}**`,
          '',
          '**ROLES**',
          roleCounts || '• No roles found',
          '',
          '━━━━━━━━━━━━━━━━━━━━'
        ].join('\n')
      )
      .setFooter({ text: 'Ultimate Rewards • Staff Management' })
      .setTimestamp();

    // Simple pagination if description would be too long (> 4000 chars)
    // For most servers this single embed is enough. If needed later we can add buttons.
    return message.reply({ embeds: [embed] });
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
          '`$custompay @user` — DM 1 item to one user',
          '`$custompay @role` — DM 1 item to every member in the role',
          '',
          '**Staff Management**',
          '`$staffstats` — premium staff team overview',
          '`$online @role` — show online members in a role',
          '',
          '**Ultimate Economy**',
          '`$ultimate` — show your coins',
          '`$ultimate @user` — show someone\'s coins',
          '`$ultimate give @user <amt>` — send coins',
          '`$ultimate daily` — claim daily reward',
          '`$ultimate cf <amt> <head|tail>` — coin flip',
          '`$ultimate top` — richest users',
          '`$ultimate add <amt> [@user]` — add coins (Owner/Co-Owner)',
          '',
          '**Other**',
          '`$help` — this message'
        ].join('\n')
      )
      .setFooter({ text: 'Most commands are staff-only' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

});

client.login(TOKEN);
