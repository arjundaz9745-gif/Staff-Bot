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
  ComponentType,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '';
const PREFIX = process.env.PREFIX || '$';
const PORT = process.env.PORT || 3000;

// Staff role hierarchy for $staffstats (highest first)
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || '1547183159794204675';
const CO_OWNER_ROLE_ID = process.env.CO_OWNER_ROLE_ID || '1547183161300090950';
const MANAGER_ROLE_ID = process.env.MANAGER_ROLE_ID || '1549036072909021285';
const HEAD_ADMIN_ROLE_ID = process.env.HEAD_ADMIN_ROLE_ID || '1547183162457718847';
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || '1547183164185911356';
const STAFF_TEAM_ROLE_ID = process.env.STAFF_TEAM_ROLE_ID || ''; // optional: all staff role
const REWARD_STAFF_ROLE_ID = process.env.REWARD_STAFF_ROLE_ID || '1548173330794815599'; // online staff to ping for claims
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || ''; // optional: auto-prompt in new tickets

// Anti-raid settings
const ANTIRAID_LOG_CHANNEL_ID = process.env.ANTIRAID_LOG_CHANNEL_ID || ''; // optional log channel
const TEAMUP_CATEGORY_ID = process.env.TEAMUP_CATEGORY_ID || ''; // optional category for teamup tickets
const MASS_PING_LIMIT = 3;          // same user mentioned this many times
const MASS_PING_WINDOW_MS = 15000;  // within 15 seconds
const MASS_PING_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

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
      if (!d.counting) d.counting = {}; // { channelId: { current: number, lastUserId: string } }
      if (!d.teamups) d.teamups = {}; // { channelId: { creatorId, members[], panelMsgId, status } }
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
    daily: {},
    counting: {},
    teamups: {}
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

// In-memory anti-raid trackers (reset on restart – fine for short windows)
const recentMentions = new Map(); // key: `${authorId}:${targetId}` → timestamps[]
const recentChannelRenames = new Map(); // key: userId → timestamps[]


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

function buildTeamupPanel(team) {
  const count = (team.members || []).length;
  const status = team.status || 'pending';
  const statusEmoji = status === 'closed' ? '🔒' : status === 'open' ? '🟢' : '🟡';
  const statusText = status === 'closed' ? 'Closed' : status === 'open' ? 'Open' : 'Pending';
  const memberLines = (team.members || [])
    .map((id, i) => `\`#${i + 1}\` <@${id}>`)
    .join('\n') || '—';

  return new EmbedBuilder()
    .setColor(status === 'closed' ? 0xed4245 : 0x57f287)
    .setTitle('🎮 TeamUp Live Panel')
    .setDescription(
      `**People in the team:** \`${count}/20\`\n` +
      `**Status:** ${statusEmoji} **${statusText}**\n\n` +
      `**Members**\n${memberLines}\n\n` +
      `\`$leave\` — leave this TeamUp\n` +
      `\`$close\` — close & delete (creator/staff)`
    )
    .setFooter({ text: 'Ultimate Rewards • TeamUp' })
    .setTimestamp();
}

async function updateTeamupPanel(channel, team) {
  if (!team?.panelMsgId) return;
  try {
    const msg = await channel.messages.fetch(team.panelMsgId);
    await msg.edit({ embeds: [buildTeamupPanel(team)] });
  } catch (_) {}
}


const REWARD_TIERS = [
  { id: 1, invites: 2, name: 'MCFA', type: 'reward' },
  { id: 2, invites: 4, name: 'Xbox Code', type: 'reward' },
  { id: 3, invites: 5, name: 'MCFA — Hypixel Unbanned', type: 'reward' },
  { id: 4, invites: 8, name: 'Netflix Premium — PC Login', type: 'reward' },
  { id: 5, invites: 10, name: 'Crunchyroll Premium', type: 'reward' },
  { id: 6, invites: 2, name: 'MC Redeem Code Method', type: 'method' },
  { id: 7, invites: 4, name: 'Nitro Basic Yearly Method', type: 'method' },
  { id: 8, invites: 5, name: 'MCFA Email Change Method', type: 'method' },
  { id: 9, invites: 8, name: 'MCFA Password Change Method', type: 'method' },
  { id: 10, invites: 12, name: '5,000 Robux Method', type: 'method' }
];

function getUserInvites(guildId, userId) {
  return data.invites[guildId]?.[userId] || 0;
}

function getEligibleRewards(inviteCount) {
  return REWARD_TIERS.filter((r) => inviteCount >= r.invites);
}

function buildRewardMenuEmbed(user, inviteCount, eligible) {
  const rewardLines = eligible
    .filter((r) => r.type === 'reward')
    .map((r) => `\`${r.id}.\` **${r.invites} Invites** → **${r.name}**`);
  const methodLines = eligible
    .filter((r) => r.type === 'method')
    .map((r) => `\`${r.id}.\` **${r.invites} Invites** → **${r.name}**`);

  let desc = `**Your invites:** \`${inviteCount}\`\n\n`;
  if (!eligible.length) {
    desc += '❌ You need at least **2 invites** to claim a reward.';
  } else {
    if (rewardLines.length) {
      desc += '### 🎁 Reward Tiers\n' + rewardLines.join('\n') + '\n\n';
    }
    if (methodLines.length) {
      desc += '### 🛠️ Method Rewards\n' + methodLines.join('\n') + '\n\n';
    }
    desc += '**Reply with the number** of the reward you want (e.g. `3`)';
  }

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎁 Claim Your Reward')
    .setDescription(desc)
    .setFooter({ text: 'Ultimate Rewards • Invite Claim' })
    .setTimestamp();
}

async function pingOnlineRewardStaff(guild, claimUser, rewardName) {
  const roleId = REWARD_STAFF_ROLE_ID;
  if (!roleId) return null;
  const role = guild.roles.cache.get(roleId);
  if (!role) return null;

  try {
    await guild.members.fetch();
  } catch (_) {}

  const online = role.members.filter(
    (m) =>
      !m.user.bot &&
      m.presence &&
      ['online', 'idle', 'dnd'].includes(m.presence.status)
  );

  if (!online.size) {
    // fallback: mention the role
    return {
      content:
        `<@&${roleId}> ${claimUser} needs **${rewardName}** — please kindly pay them.`,
      allowedMentions: { roles: [roleId], users: [claimUser.id] }
    };
  }

  const pings = [...online.values()].map((m) => `<@${m.id}>`).join(' ');
  return {
    content:
      `${pings}\n${claimUser} needs **${rewardName}** — please kindly pay them.`,
    allowedMentions: { users: [...online.keys(), claimUser.id] }
  };
}

async function startRewardClaimFlow(channel, user) {
  const invites = getUserInvites(channel.guild.id, user.id);
  const eligible = getEligibleRewards(invites);
  const embed = buildRewardMenuEmbed(user, invites, eligible);
  const menuMsg = await channel.send({ content: `${user}`, embeds: [embed] });

  if (!eligible.length) return;

  const collector = channel.createMessageCollector({
    filter: (m) => m.author.id === user.id && !m.author.bot,
    time: 5 * 60 * 1000,
    max: 10
  });

  collector.on('collect', async (m) => {
    const num = parseInt(m.content.trim(), 10);
    if (!num) {
      await channel.send(`${user} Please reply with a **number** from the list.`).catch(() => {});
      return;
    }
    const chosen = eligible.find((r) => r.id === num);
    if (!chosen) {
      await channel.send(
        `${user} That option is not available for you. Pick a number from the list above.`
      ).catch(() => {});
      return;
    }

    collector.stop('chosen');
    const pingPayload = await pingOnlineRewardStaff(channel.guild, user, chosen.name);
    if (pingPayload) {
      await channel.send(pingPayload).catch(() => {});
    } else {
      await channel.send(
        `${user} selected **${chosen.name}** — staff will assist shortly.`
      ).catch(() => {});
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'chosen') {
      await channel.send(`${user} Reward selection timed out. Use \`$claim\` to try again.`).catch(() => {});
    }
  });
}



function emailFormatOk(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}
function domainOf(email) {
  const i = String(email || '').lastIndexOf('@');
  return i >= 0 ? String(email).slice(i + 1).toLowerCase() : '';
}
function isAllowedEmailDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d) return false;
  const exact = new Set([
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'passport.com',
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.in', 'icloud.com', 'me.com', 'mac.com',
    'proton.me', 'protonmail.com'
  ]);
  if (exact.has(d)) return true;
  // outlook.fr, hotmail.es, live.co.uk, outlook.com.br, msn.nl, etc.
  if (/^(outlook|hotmail|live|msn)(\.[a-z0-9-]+)+$/i.test(d)) return true;
  if (/^gmail(\.[a-z]{2,})+$/i.test(d)) return true;
  if (/^yahoo(\.[a-z0-9-]+)+$/i.test(d)) return true;
  return false;
}
function passNotes(pass) {
  const notes = [];
  const pw = String(pass || '');
  if (pw.length >= 8) notes.push('length 8+');
  else notes.push('short (<8)');
  if (/[A-Z]/.test(pw)) notes.push('uppercase');
  if (/[a-z]/.test(pw)) notes.push('lowercase');
  if (/[0-9]/.test(pw)) notes.push('number');
  if (/[^A-Za-z0-9]/.test(pw)) notes.push('symbol');
  return notes.join(', ');
}
function classifyAccount(acc) {
  const idx = acc.indexOf(':');
  const email = acc.slice(0, idx);
  const pass = acc.slice(idx + 1);
  const domain = domainOf(email);
  const fmt = emailFormatOk(email);
  const domOk = isAllowedEmailDomain(domain);
  return { email, pass, domain, fmt, domOk, ok: fmt && domOk, acc: `${email}:${pass}` };
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

  // ========== LEGIT REACTION ==========
  // If message contains the word "legit" → react with ✅
  try {
    if (/\blegit\b/i.test(message.content)) {
      await message.react('✅').catch(() => {});
    }
  } catch (_) {}

  // ========== ANTI MASS-PING ==========
  // If the same user is mentioned 3+ times quickly by one person → 3 day timeout
  try {
    if (message.mentions.users.size > 0 && message.member && message.guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      const now = Date.now();
      for (const [targetId] of message.mentions.users) {
        if (targetId === message.author.id) continue; // ignore self-pings

        // Never punish for pinging someone who has the Owner role
        const targetMember = message.guild.members.cache.get(targetId) ||
          await message.guild.members.fetch(targetId).catch(() => null);
        if (targetMember && OWNER_ROLE_ID && targetMember.roles.cache.has(OWNER_ROLE_ID)) {
          continue;
        }

        const key = `${message.author.id}:${targetId}`;
        let times = recentMentions.get(key) || [];
        times = times.filter((t) => now - t < MASS_PING_WINDOW_MS);
        times.push(now);
        recentMentions.set(key, times);

        if (times.length >= MASS_PING_LIMIT) {
          recentMentions.delete(key);
          // Apply 3-day timeout
          await message.member.timeout(MASS_PING_TIMEOUT_MS, `Anti-raid: mass pinged the same user ${MASS_PING_LIMIT}+ times`);
          await message.reply(
            `⏱️ **${message.author.username}** has been timed out for **3 days** for mass-pinging.`
          ).catch(() => {});

          // Optional log
          if (ANTIRAID_LOG_CHANNEL_ID) {
            const logCh = message.guild.channels.cache.get(ANTIRAID_LOG_CHANNEL_ID);
            if (logCh) {
              const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('🛡️ Anti-Raid — Mass Ping')
                .setDescription(
                  `**User:** ${message.author.tag} (\`${message.author.id}\`)
` +
                  `**Target:** <@${targetId}>
` +
                  `**Action:** Timed out for 3 days
` +
                  `**Channel:** ${message.channel}`
                )
                .setTimestamp();
              logCh.send({ embeds: [embed] }).catch(() => {});
            }
          }
          break;
        }
      }
    }
  } catch (e) {
    console.error('Mass-ping protection error:', e.message);
  }

  // ========== COUNTING CHANNEL ==========
  try {
    const countData = data.counting[message.channel.id];
    if (countData && !message.content.startsWith(PREFIX)) {
      const content = message.content.trim();
      // Only pure numbers count
      if (/^\d+$/.test(content)) {
        const num = parseInt(content, 10);
        const expected = (countData.current || 0) + 1;

        if (message.author.id === countData.lastUserId) {
          await message.react('❌').catch(() => {});
          await message.reply(
            `❌ **${message.author.username}** — you can't count twice in a row! Next number is **${expected}**.`
          ).catch(() => {});
        } else if (num !== expected) {
          await message.react('❌').catch(() => {});
          await message.reply(
            `❌ Wrong number! Expected **${expected}**. Count reset to **0**.`
          ).catch(() => {});
          data.counting[message.channel.id] = { current: 0, lastUserId: null };
          saveData();
        } else {
          // Correct
          data.counting[message.channel.id] = {
            current: num,
            lastUserId: message.author.id
          };
          saveData();
          await message.react('✅').catch(() => {});
        }
      }
      // Non-number messages in counting channel are ignored (or you can delete them later)
      return; // don't process as command
    }
  } catch (e) {
    console.error('Counting error:', e.message);
  }

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
          'Usage:\n`$mcfa add mail:pass`\n`$mcfa add mail:pass mail:pass`\nOnly valid domains (outlook.fr, gmail, …) are stored.'
        );
      }
      let added = 0;
      let skipped = 0;
      for (const a of accounts) {
        const c = classifyAccount(a);
        if (!c.ok) { skipped++; continue; }
        if (!data.mcfaStock.includes(c.acc)) {
          data.mcfaStock.push(c.acc);
          added++;
        }
      }
      saveData();
      return message.reply(
        `Added **${added}** MCFA · skipped invalid **${skipped}** · Stock now **${data.mcfaStock.length}**`
      );
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

  // ========== $count #channel ==========
  // Staff only — enable / disable / status counting in a channel
  if (cmd === 'count') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const sub = (args[0] || '').toLowerCase();
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get((args[0] || '').replace(/[<#>]/g, '')) ||
      (sub && !['status', 'off', 'stop', 'disable', 'reset'].includes(sub)
        ? message.guild.channels.cache.get(sub.replace(/[<#>]/g, ''))
        : null) ||
      message.channel;

    // $count status / $count  (current channel)
    if (!sub || sub === 'status' || sub === 'info') {
      const info = data.counting[channel.id];
      if (!info) {
        return message.reply(`Counting is **not active** in ${channel}.\nEnable with \`$count ${channel}\``);
      }
      return message.reply(
        `**Counting in ${channel}**\n` +
        `Current number: **${info.current || 0}**\n` +
        `Last counter: ${info.lastUserId ? `<@${info.lastUserId}>` : '—'}\n` +
        `Next number: **${(info.current || 0) + 1}**`
      );
    }

    // $count off / stop / disable
    if (['off', 'stop', 'disable'].includes(sub)) {
      const target =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get((args[1] || '').replace(/[<#>]/g, '')) ||
        message.channel;
      if (data.counting[target.id]) {
        delete data.counting[target.id];
        saveData();
        return message.reply(`Counting **disabled** in ${target}.`);
      }
      return message.reply(`Counting was not active in ${target}.`);
    }

    // $count reset
    if (sub === 'reset') {
      const target =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get((args[1] || '').replace(/[<#>]/g, '')) ||
        message.channel;
      if (!data.counting[target.id]) {
        return message.reply(`Counting is not active in ${target}.`);
      }
      data.counting[target.id] = { current: 0, lastUserId: null };
      saveData();
      return message.reply(`Counting **reset to 0** in ${target}. Next number is **1**.`);
    }

    // $count #channel  → enable
    if (channel.type !== 0 && channel.type !== 5) { // GuildText or GuildAnnouncement
      return message.reply('Please mention a text channel.');
    }

    data.counting[channel.id] = { current: 0, lastUserId: null };
    saveData();
    return message.reply(
      `✅ Counting **enabled** in ${channel}.\n` +
      `Rules:\n` +
      `• Count in order: 1, 2, 3, …\n` +
      `• Same person cannot count twice in a row\n` +
      `• Wrong number = reset to 0`
    );
  }


  // ========== $team <game> ... ==========
  // LFG announcement for supported games
  if (cmd === 'team') {
    const gameRaw = (args[0] || '').toLowerCase();
    const rest = args.slice(1);

    const games = {
      minecraft: { name: 'Minecraft', emoji: '⛏️', timeMax: 5 },
      pubg: { name: 'PUBG', emoji: '🔫', timeMax: 5 },
      bgmi: { name: 'BGMI', emoji: '📱', timeMax: 5 },
      freefire: { name: 'Free Fire', emoji: '🔥', timeMax: 5 },
      'free-fire': { name: 'Free Fire', emoji: '🔥', timeMax: 5 },
      ff: { name: 'Free Fire', emoji: '🔥', timeMax: 5 },
      amongus: { name: 'Among Us', emoji: '🚀', timeMax: 10 },
      'among-us': { name: 'Among Us', emoji: '🚀', timeMax: 10 },
      au: { name: 'Among Us', emoji: '🚀', timeMax: 10 }
    };

    // normalize "among us" / "free fire"
    let gameKey = gameRaw;
    if (gameRaw === 'among' && (args[1] || '').toLowerCase() === 'us') {
      gameKey = 'amongus';
      rest.shift();
    } else if (gameRaw === 'free' && (args[1] || '').toLowerCase() === 'fire') {
      gameKey = 'freefire';
      rest.shift();
    }

    const game = games[gameKey];
    if (!game) {
      return message.reply(
        '**Supported games:**\n' +
        '`$team minecraft <ip:port> <1-5min>`\n' +
        '`$team pubg <in-game id> <1-5min>`\n' +
        '`$team bgmi <in-game id> <1-5min>`\n' +
        '`$team freefire <in-game id> <1-5min>`\n' +
        '`$team amongus <lobby code> <1-10min>`'
      );
    }

    if (rest.length < 2) {
      return message.reply(`Usage: \`$team ${gameKey} <info> <time>\``);
    }

    const timeStr = rest[rest.length - 1].toLowerCase().replace(/min(ute)?s?/, '');
    const time = parseInt(timeStr, 10);
    const info = rest.slice(0, -1).join(' ');

    if (!time || time < 1 || time > game.timeMax) {
      return message.reply(`Time must be between **1-${game.timeMax} minutes**.`);
    }
    if (!info) {
      return message.reply(`Please provide the required info for **${game.name}**.`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`👬 Looking for Team`)
      .setDescription(
        `**Game:** ${game.name}\n` +
        `**Info:** \`${info}\`\n` +
        `**Duration:** currently / **${time} min**\n` +
        `**Status:** 🟢 **Active**\n` +
        `**Members in the group:** \`1/20\`\n\n` +
        `**Host:** ${message.author.username}`
      )
      .setFooter({ text: 'Ultimate Rewards • Team Finder' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ========== $teamup @user(s) ==========
  // Creates a private temporary channel for the group (max 20) with live panel
  if (cmd === 'teamup') {
    const targets = [...message.mentions.users.values()].filter((u) => !u.bot && u.id !== message.author.id);

    if (!targets.length) {
      return message.reply('Usage: `$teamup @user1 @user2 ...` (mention who you want to play with)');
    }
    if (targets.length > 19) {
      return message.reply('Max **20** people total (you + 19 others).');
    }

    if (!message.guild.members.me?.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel])) {
      return message.reply('I need **Manage Channels** permission to create teamup tickets.');
    }

    const memberIds = [message.author.id, ...targets.map((u) => u.id)];
    const channelName = `teamup-${message.author.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);

    try {
      const overwrites = [
        { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: message.guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages
          ]
        }
      ];

      for (const id of memberIds) {
        overwrites.push({
          id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        });
      }

      for (const roleId of [OWNER_ROLE_ID, CO_OWNER_ROLE_ID, MANAGER_ROLE_ID, HEAD_ADMIN_ROLE_ID, ADMIN_ROLE_ID, STAFF_TEAM_ROLE_ID]) {
        if (roleId && message.guild.roles.cache.has(roleId)) {
          overwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          });
        }
      }

      const createOpts = {
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
        topic: `TeamUp by ${message.author.username} | $close to close | $leave to leave`,
        reason: `TeamUp created by ${message.author.tag}`
      };
      if (TEAMUP_CATEGORY_ID) createOpts.parent = TEAMUP_CATEGORY_ID;

      const ch = await message.guild.channels.create(createOpts);

      const team = {
        creatorId: message.author.id,
        members: memberIds,
        panelMsgId: null,
        status: 'pending' // pending → open → closed
      };

      const panel = buildTeamupPanel(team);
      const mentionList = memberIds.map((id) => `<@${id}>`).join(' ');
      const panelMsg = await ch.send({ content: mentionList, embeds: [panel] });

      team.panelMsgId = panelMsg.id;
      team.status = 'open';
      data.teamups[ch.id] = team;
      saveData();

      // Update panel to "Open"
      await panelMsg.edit({ embeds: [buildTeamupPanel(team)] });

      return message.reply(`✅ TeamUp created: ${ch}`);
    } catch (e) {
      console.error('teamup error:', e.message);
      return message.reply('Failed to create TeamUp channel. Check my permissions.');
    }
  }

  // ========== $close / $leave (inside TeamUp channels) ==========
  if (cmd === 'close' || cmd === 'leave') {
    const ch = message.channel;
    if (!ch.name?.startsWith('teamup-')) {
      return message.reply('This command only works inside a **TeamUp** channel.');
    }

    const team = data.teamups[ch.id];

    if (cmd === 'leave') {
      try {
        await ch.permissionOverwrites.edit(message.author.id, { ViewChannel: false });

        if (team) {
          team.members = (team.members || []).filter((id) => id !== message.author.id);
          saveData();
          await updateTeamupPanel(ch, team);
        }

        await message.reply(`👋 **${message.author.username}** left the TeamUp.`);
      } catch (e) {
        return message.reply('Could not remove you from this channel.');
      }
      return;
    }

    // $close
    const isCreator = team
      ? team.creatorId === message.author.id
      : ch.name.includes(message.author.username.toLowerCase().replace(/[^a-z0-9]/g, ''));

    if (!isCreator && !isStaff(message.member)) {
      return message.reply('Only the **creator** or **staff** can close this TeamUp.');
    }

    if (team) {
      team.status = 'closed';
      saveData();
      await updateTeamupPanel(ch, team);
    }

    await message.reply('🔒 Closing TeamUp in 3 seconds...');
    setTimeout(() => {
      if (data.teamups[ch.id]) {
        delete data.teamups[ch.id];
        saveData();
      }
      ch.delete('TeamUp closed').catch(() => {});
    }, 3000);
    return;
  }


  // ========== $claim ==========
  // In a ticket: show eligible rewards based on invites, then ping online staff
  if (cmd === 'claim') {
    await startRewardClaimFlow(message.channel, message.author);
    return;
  }

  // ========== $staffstats ==========
  if (cmd === 'staffstats') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    // Role hierarchy (highest priority first) — members appear only under their highest role
    const staffRoleConfig = [
      { id: OWNER_ROLE_ID, label: '👑 Owner', key: 'owner' },
      { id: CO_OWNER_ROLE_ID, label: '💎 Co-Owner', key: 'coowner' },
      { id: MANAGER_ROLE_ID, label: '📋 Manager', key: 'manager' },
      { id: HEAD_ADMIN_ROLE_ID, label: '🛡️ Head Admin', key: 'headadmin' },
      { id: ADMIN_ROLE_ID, label: '⚔️ Admin', key: 'admin' },
      { id: STAFF_TEAM_ROLE_ID, label: '👥 Staff Team', key: 'staffteam' }
    ].filter((r) => r.id); // only keep configured ones

    if (!staffRoleConfig.length) {
      return message.reply(
        'No staff roles configured.\n' +
          'Set staff role IDs in your environment (OWNER, CO_OWNER, MANAGER, HEAD_ADMIN, ADMIN, STAFF_TEAM).'
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

    // Collect bots
    const botNames = [];
    for (const [, member] of message.guild.members.cache) {
      if (member.user.bot) {
        botNames.push(member.displayName || member.user.username);
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

    // Bots section
    if (botNames.length) {
      sections.push(`**🤖 Bots**\n${botNames.map((n) => `• ${n}`).join('\n')}`);
    } else {
      sections.push('**🤖 Bots**\n• —');
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


  // ========== $format email:pass (format + domain only — NO login) ==========
  // $format a:b c:d     → check only
  // $format add a:b     → check + add valid ones to MCFA stock
  if (cmd === 'format' || cmd === 'emailcheck') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const rest = body.slice(cmd.length).trim();
    if (!rest) {
      return message.reply(
        'Usage:\n' +
          '`$format email:pass` — check only\n' +
          '`$format add email:pass` — check + **add valid to stock**\n' +
          'Multiple accounts OK. Accepts `outlook.fr`, `hotmail.es`, etc.\n' +
          'Does **not** try to log in.'
      );
    }

    const doAdd = (args[0] || '').toLowerCase() === 'add';
    const listText = doAdd
      ? body.slice(body.toLowerCase().indexOf('add') + 3).trim()
      : rest;
    const accounts = parseAccounts(listText);
    if (!accounts.length) {
      return message.reply('No `email:pass` found. Example: `$format add user@outlook.fr:Pass123!`');
    }

    const valid = [];
    const invalid = [];

    for (const acc of accounts) {
      const c = classifyAccount(acc);
      const passOk = c.pass.length >= 8;
      const block =
        `📧 **Email Check**\n` +
        `Email: \`${c.email}\`\n` +
        `Password: \`••••••••\`\n` +
        `─────────────\n` +
        `${c.fmt ? '✅' : '❌'} Email format: ${c.fmt ? 'Valid' : 'Invalid'}\n` +
        `${c.domOk ? '✅' : '❌'} Domain: ${c.domain || '—'}${c.domOk ? '' : ' (not allowed)'}\n` +
        `${passOk ? '✅' : '⚠️'} Password length: ${passOk ? 'OK (8+)' : 'Too short'}\n` +
        `⚠️ Notes: ${passNotes(c.pass)}\n` +
        `─────────────\n` +
        `Status: **${c.ok ? 'Looks valid' : 'Invalid / skipped'}**`;

      if (c.ok) valid.push({ ...c, block });
      else invalid.push({ email: c.email, block });
    }

    let added = 0;
    if (doAdd) {
      for (const v of valid) {
        if (!data.mcfaStock.includes(v.acc)) {
          data.mcfaStock.push(v.acc);
          added++;
        }
      }
      saveData();
    }

    await message.reply(
      `Checked **${accounts.length}** · ✅ valid: **${valid.length}** · ❌ skipped: **${invalid.length}**` +
        (doAdd ? ` · 📥 added to stock: **${added}** (stock now **${data.mcfaStock.length}**)` : '')
    );

    for (const v of valid.slice(0, 12)) {
      await message.channel.send(v.block + `\nReveal: ||${v.acc}||`);
    }
    if (valid.length > 12) {
      await message.channel.send(`…and **${valid.length - 12}** more valid.`);
    }
    if (invalid.length && invalid.length <= 15) {
      await message.channel.send(
        '**Skipped (invalid format/domain):**\n' +
          invalid.map((x) => `• \`${x.email}\``).join('\n')
      );
    }
    return;
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
          '$staffstats` — premium staff team overview',
          '`$claim` — claim invite reward (in tickets)',
          '`$online @role` — show online members in a role',
          '`$count #channel` — enable counting game',
          '`$count status` — counting status',
          '`$count reset` — reset count to 0',
          '`$count off` — disable counting',
          '',
          '**Team Finder**',
          '`$team <game> <info> <time>` — LFG post',
          '`$teamup @user(s)` — create private TeamUp channel',
          '`$close` / `$leave` — inside TeamUp channels',
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
          '`$format email:pass` — validate email domain/format (no login)',
          '`$help` — this message'
        ].join('\n')
      )
      .setFooter({ text: 'Most commands are staff-only' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

});

// ========== ANTI-RAID: Channel / Category rename protection ==========
const RAID_NAME_PATTERNS = [
  /raided/i,
  /this server was raided/i,
  /nigg/i,
  /fuck\s*you/i,
  /get\s*fucked/i,
  /@everyone/i,
  /discord\.gg\//i
];

// Auto-prompt reward claim when a ticket channel is created
client.on('channelCreate', async (channel) => {
  try {
    if (!channel.guild || channel.type !== ChannelType.GuildText) return;
    const name = (channel.name || '').toLowerCase();
    const isTicket =
      name.startsWith('ticket-') ||
      name.startsWith('claim-') ||
      name.includes('ticket') ||
      (TICKET_CATEGORY_ID && channel.parentId === TICKET_CATEGORY_ID);

    if (!isTicket) return;

    // Wait a moment for Ticket Tool to finish setup / permissions
    await new Promise((r) => setTimeout(r, 2500));

    // Find ticket opener from channel name (ticket-username) or topic
    let opener = null;
    const match = channel.name.match(/^ticket[-_]?(.+)$/i);
    if (match) {
      const uname = match[1].replace(/[^a-z0-9._]/gi, '');
      opener = channel.guild.members.cache.find(
        (m) => m.user.username.toLowerCase() === uname.toLowerCase()
      )?.user;
    }
    // Fallback: first non-bot human with view access who isn't staff-only
    if (!opener) {
      try {
        const msgs = await channel.messages.fetch({ limit: 5 });
        const human = msgs.find((m) => !m.author.bot);
        if (human) opener = human.author;
      } catch (_) {}
    }

    if (!opener) {
      await channel.send(
        '🎁 Welcome! Use `$claim` to choose a reward based on your invites.'
      ).catch(() => {});
      return;
    }

    await startRewardClaimFlow(channel, opener);
  } catch (e) {
    console.error('channelCreate ticket claim:', e.message);
  }
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
  try {
    if (!newChannel.guild) return;
    if (oldChannel.name === newChannel.name) return;

    const audit = await newChannel.guild.fetchAuditLogs({
      type: 11, // CHANNEL_UPDATE
      limit: 1
    }).catch(() => null);

    const entry = audit?.entries?.first();
    const executor = entry?.executor;
    if (!executor || executor.bot) return;
    if (entry && Date.now() - entry.createdTimestamp > 10000) return; // too old

    const newName = newChannel.name || '';
    const isSuspicious = RAID_NAME_PATTERNS.some((re) => re.test(newName));

    // Also flag very rapid renames by same user
    const now = Date.now();
    const key = executor.id;
    let times = recentChannelRenames.get(key) || [];
    times = times.filter((t) => now - t < 30000); // 30s window
    times.push(now);
    recentChannelRenames.set(key, times);
    const rapidRename = times.length >= 4;

    if (!isSuspicious && !rapidRename) return;

    // Revert the name
    await newChannel.setName(oldChannel.name, 'Anti-raid: suspicious rename').catch(() => {});

    // Timeout the executor (3 days) if possible
    const member = await newChannel.guild.members.fetch(executor.id).catch(() => null);
    if (member && newChannel.guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await member.timeout(MASS_PING_TIMEOUT_MS, 'Anti-raid: suspicious channel rename').catch(() => {});
    }

    // Log
    if (ANTIRAID_LOG_CHANNEL_ID) {
      const logCh = newChannel.guild.channels.cache.get(ANTIRAID_LOG_CHANNEL_ID);
      if (logCh) {
        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🛡️ Anti-Raid — Channel Rename Blocked')
          .setDescription(
            `**User:** ${executor.tag} (\`${executor.id}\`)\n` +
            `**Channel:** ${newChannel}\n` +
            `**Old name:** \`${oldChannel.name}\`\n` +
            `**Tried to set:** \`${newName}\`\n` +
            `**Action:** Name reverted` + (member ? ' + 3 day timeout' : '')
          )
          .setTimestamp();
        logCh.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('channelUpdate anti-raid error:', e.message);
  }
});

client.login(TOKEN);

