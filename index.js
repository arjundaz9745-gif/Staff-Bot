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
  PermissionsBitField,
  AttachmentBuilder
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
      if (!d.teamups) d.teamups = {};
      if (!Array.isArray(d.hits)) d.hits = [];
      if (!d.exportCounts) d.exportCounts = { mcfa: 0, custom: 0, hits: 0 };
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
    teamups: {},
    hits: [],
    exportCounts: { mcfa: 0, custom: 0, hits: 0 }
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
const recentChannelRenames = new Map();

const hitRunner = { running: false, timer: null, channelId: null, index: 0, queue: [] };


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

function isHeadAdminOrAbove(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (OWNER_ROLE_ID && member.roles.cache.has(OWNER_ROLE_ID)) return true;
  if (CO_OWNER_ROLE_ID && member.roles.cache.has(CO_OWNER_ROLE_ID)) return true;
  if (MANAGER_ROLE_ID && member.roles.cache.has(MANAGER_ROLE_ID)) return true;
  if (HEAD_ADMIN_ROLE_ID && member.roles.cache.has(HEAD_ADMIN_ROLE_ID)) return true;
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



async function exportStockToChannel(message, kind, lines, label) {
  if (!lines.length) {
    return message.reply(`No **${label}** stock to export.`);
  }
  const ch =
    message.mentions.channels.first() ||
    message.guild.channels.cache.get((message.content.match(/<#(\d+)>/) || [])[1]) ||
    message.channel;

  if (!ch || !ch.isTextBased?.()) {
    return message.reply('Mention a text channel: `$mcfa export #channel`');
  }

  if (!data.exportCounts) data.exportCounts = { mcfa: 0, custom: 0, hits: 0 };
  data.exportCounts[kind] = (data.exportCounts[kind] || 0) + 1;
  const n = data.exportCounts[kind];
  saveData();

  const filename = `export_${n}.txt`;
  const body =
    `Ultimate Rewards — ${label} export #${n}\n` +
    `Exported by: ${message.author.tag} (${message.author.id})\n` +
    `At: ${new Date().toISOString()}\n` +
    `Count: ${lines.length}\n` +
    `${'='.repeat(40)}\n` +
    lines.join('\n') +
    `\n`;

  const file = new AttachmentBuilder(Buffer.from(body, 'utf8'), { name: filename });
  await ch.send({
    content: `📤 **${label} export** \`${filename}\` — **${lines.length}** item(s)`,
    files: [file]
  });
  return message.reply(
    `Exported successful all available **${label}** into ${ch}.\nUploaded as **${filename}**.`
  );
}

function ultimateFaqReply(text) {
  const q = String(text || '').toLowerCase().trim();

  // Block: bot-making + clearly illegal
  if (/(how to (make|code|build|create) (a )?bot|discord\.js tutorial|steal account|hack account|crack account|carding|phishing|doxx|ransomware)/i.test(q)) {
    return "I can't help with that. For **Ultimate Rewards** help, open a ticket or ask staff.";
  }

  if (!q || q === 'help' || /^(hi|hello|hey)\b/.test(q)) {
    return (
      "Hey! I'm the **Ultimate Rewards** helper.\n" +
      "Ask me about the server, **MCFA/NFA/SFA**, invites, tickets, or products.\n" +
      "Website: https://ultimate-rewards.onrender.com"
    );
  }

  if (/(website|site|web page|webstore|store link|url)/i.test(q)) {
    return (
      "**Website:** https://ultimate-rewards.onrender.com\n" +
      "Login with Discord → products, payment, tickets."
    );
  }

  if (/\bmcfa\b/.test(q)) {
    return (
      "**MCFA** = Minecraft **Full Access** (you get email + password style access as delivered by staff).\n" +
      "Order/claim via ticket or the website. Staff verify payment then deliver."
    );
  }
  if (/\bnfa\b/.test(q)) {
    return (
      "**NFA** = **Non-Full Access** account type (more limited than MCFA).\n" +
      "Ask staff in a ticket what's in stock right now."
    );
  }
  if (/\bsfa\b/.test(q)) {
    return (
      "**SFA** = **Semi-Full Access** — between NFA and MCFA depending on the listing.\n" +
      "Open a ticket for current stock and details."
    );
  }

  if (/(ticket|support|staff help|order problem|payment issue|upi|qr)/i.test(q)) {
    return (
      "Open a **support ticket** on this Discord, or use the site:\n" +
      "https://ultimate-rewards.onrender.com\n" +
      "Describe your issue and staff will help."
    );
  }

  if (/(invite|reward|claim|milestone)/i.test(q)) {
    return (
      "Create a **permanent invite**, invite real friends, hit a milestone, then open a ticket and use **`$claim`** (or follow the ticket bot) to pick your reward.\n" +
      "Fake/J4J invites don't count."
    );
  }

  if (/(price|cost|how much|rate|inr|robux|crunchyroll|youtube|premium)/i.test(q)) {
    return (
      "Prices change — check **https://ultimate-rewards.onrender.com** or ask staff in a ticket for the latest rates."
    );
  }

  if (/(legit|scam|trusted|safe)/i.test(q)) {
    return (
      "Use official tickets and the website only. Never pay random DMs.\n" +
      "Site: https://ultimate-rewards.onrender.com — if something's wrong, open a ticket."
    );
  }

  if (/(stock|available|have mcfa|out of stock)/i.test(q)) {
    return "Stock changes fast. Ask staff in a ticket or check the website for what's available.";
  }

  if (/(discord|server|rules)/i.test(q)) {
    return "This is the **Ultimate Rewards** server — rewards, digital products, invite events. Follow staff instructions in tickets. Website: https://ultimate-rewards.onrender.com";
  }

  // Friendly general fallback (still on-topic helper, not unrestricted AI)
  return (
    "I'm here for **Ultimate Rewards** questions.\n" +
    "• Website: https://ultimate-rewards.onrender.com\n" +
    "• Products: MCFA / NFA / SFA & more\n" +
    "• Help: open a **ticket**\n" +
    "• Staff tools: `$help`\n\n" +
    "Try asking about website, MCFA, tickets, invites, or prices. I can't help with bot-making or illegal stuff."
  );
}


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


  // ========== @Bot FAQ AI ==========
  try {
    if (client.user && message.mentions.has(client.user) && !message.author.bot) {
      const cleaned = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();
      const reply = ultimateFaqReply(cleaned || 'help');
      await message.reply(reply).catch(() => {});
    }
  } catch (e) {
    console.error('faq:', e.message);
  }

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

    
    if (sub === 'export') {
      const lines = data.mcfaStock || [];
      return exportStockToChannel(message, 'mcfa', lines, 'MCFA');
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
        '`$mcfa export #channel` — export stock as export_N.txt\n' +
        '`$pay @user [n]` — DM MCFA\n' +
        '`$salary @user [n]` — salary (restricted)'
    );
  }

  // ========== $pay @user [amount] ==========
  if (cmd === 'pay') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));

    if (!user || user.bot) {
      return message.reply('Usage: `$pay @user` or `$pay @user 10` — DM MCFA from stock');
    }

    let amount = 1;
    for (const a of args) {
      if (/^\d+$/.test(a)) {
        amount = Math.min(25, Math.max(1, parseInt(a, 10)));
        break;
      }
    }

    if (data.mcfaStock.length < amount) {
      return message.reply(
        `Not enough stock. Need **${amount}**, have **${data.mcfaStock.length}**.`
      );
    }

    const sent = [];
    for (let i = 0; i < amount; i++) {
      const account = data.mcfaStock.shift();
      data.mcfaUsed.push({
        account,
        to: user.id,
        by: message.author.id,
        at: new Date().toISOString()
      });
      sent.push(account);
    }
    saveData();

    try {
      let dm =
        `**Ultimate Rewards — MCFA delivery**\n` +
        `You received **${sent.length}** account(s). Click spoilers to reveal:\n\n`;
      sent.forEach((acc, i) => {
        dm += `**#${i + 1}** ||${acc}||\n`;
      });
      dm += `\nDelivered by staff. Do not share.`;
      await user.send(dm);
      return message.reply(
        `Paid **${sent.length}** MCFA to ${user} via DM · Stock left: **${data.mcfaStock.length}**`
      );
    } catch (e) {
      for (let i = sent.length - 1; i >= 0; i--) {
        data.mcfaStock.unshift(sent[i]);
        data.mcfaUsed.pop();
      }
      saveData();
      return message.reply(
        `Could not DM ${user} (DMs closed). Accounts were **not** taken from stock.`
      );
    }
  }

  // ========== $salary @user [amount] ==========
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
      return message.reply('Usage: `$salary @user` or `$salary @user 3`');
    }

    let amount = 1;
    for (const a of args) {
      if (/^\d+$/.test(a)) {
        amount = Math.min(25, Math.max(1, parseInt(a, 10)));
        break;
      }
    }

    if (data.mcfaStock.length < amount) {
      return message.reply(
        `Not enough stock. Need **${amount}**, have **${data.mcfaStock.length}**.`
      );
    }

    const sent = [];
    for (let i = 0; i < amount; i++) {
      const account = data.mcfaStock.shift();
      data.mcfaUsed.push({
        account,
        to: user.id,
        by: message.author.id,
        at: new Date().toISOString(),
        type: 'salary'
      });
      sent.push(account);
    }
    saveData();

    let salaryMsg =
      `# 💰 Staff Salary\n\n` +
      `Your staff reward for this month (**${sent.length}**):\n\n`;
    sent.forEach((acc, i) => {
      salaryMsg += `« Reward #${i + 1}: ||${acc}|| »\n`;
    });
    salaryMsg +=
      `\nThank you for your hard work and dedication to Ultimate Rewards! 🫡\n` +
      `Keep up the great work! 🚀`;

    try {
      await user.send(salaryMsg);
      return message.reply(
        `Sent **${sent.length}** Staff Salary to ${user} via DM · Stock left: **${data.mcfaStock.length}**`
      );
    } catch (e) {
      for (let i = sent.length - 1; i >= 0; i--) {
        data.mcfaStock.unshift(sent[i]);
        data.mcfaUsed.pop();
      }
      saveData();
      return message.reply(
        `Could not DM ${user} (DMs closed). Accounts were **not** taken from stock.`
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

    
    if (sub === 'export') {
      const lines = data.customStock || [];
      return exportStockToChannel(message, 'custom', lines, 'Custom');
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
        '`$custom export #channel` — export as export_N.txt\n' +
        '`$custompay @user` — DM 1 item\n' +
        '`$custompay @role` — DM 1 to role members'
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



  // ========== $hit (Ultimate — blue embed UI) ==========
  function buildHitEmbed(hit) {
    const hyp = hit.hypixel || 'Not Available';
    const don = hit.donut || 'Not Available';
    return new EmbedBuilder()
      .setColor(0x3b82f6)
      .setAuthor({ name: 'Ultimate Rewards • Hit' })
      .addFields(
        { name: '📧 Email', value: `||${hit.email}||`, inline: false },
        { name: '🔑 Password', value: `||${hit.pass}||`, inline: false },
        { name: '🐯 Type', value: 'MCFA', inline: false },
        { name: '🛡️ Hypixel', value: `📢 **${hyp}**`, inline: true },
        {
          name: 'Hypixel Stats',
          value: '```\nRank: N/A\nLevel: N/A\n```',
          inline: true
        },
        { name: '🛡️ Donut', value: `📢 **${don}**`, inline: true },
        {
          name: 'Donut Stats',
          value: '```\nPlaytime: N/A\nMoney: N/A\n```',
          inline: true
        },
        { name: '🌸 Capes', value: 'Starter Free Cape', inline: false },
        { name: '🔑 Combo', value: `||${hit.email}:${hit.pass}||`, inline: false }
      )
      .setFooter({ text: 'Verified by Ultimate Rewards ⭐⭐⭐⭐⭐' })
      .setTimestamp(hit.uploadedAt ? new Date(hit.uploadedAt) : new Date());
  }

  async function stopHitRunner(msg, channel) {
    if (hitRunner.timer) clearTimeout(hitRunner.timer);
    hitRunner.timer = null;
    hitRunner.running = false;
    hitRunner.queue = [];
    hitRunner.index = 0;
    if (channel && msg) await channel.send(msg).catch(() => {});
  }

  async function runNextHit() {
    if (!hitRunner.running) return;
    const ch = client.channels.cache.get(hitRunner.channelId);
    if (!ch) {
      hitRunner.running = false;
      return;
    }
    if (hitRunner.index >= hitRunner.queue.length) {
      await stopHitRunner(
        `✅ **Hit run finished** — sent **${hitRunner.queue.length}** hit(s).`,
        ch
      );
      return;
    }
    const hit = hitRunner.queue[hitRunner.index++];
    try {
      await ch.send({ embeds: [buildHitEmbed(hit)] });
    } catch (e) {
      console.error('hit send:', e.message);
    }
    if (!hitRunner.running) return;
    if (hitRunner.index >= hitRunner.queue.length) {
      await stopHitRunner(
        `✅ **Hit run finished** — sent **${hitRunner.queue.length}** hit(s).`,
        ch
      );
      return;
    }
    hitRunner.timer = setTimeout(() => runNextHit(), 5000);
  }

  if (cmd === 'hit') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'start') {
      if (hitRunner.running) return message.reply('Already running. `$hit stop` first.');
      if (!(data.hits || []).length) {
        return message.reply('Queue empty. `$hit add hypixel email:pass` or `$hit add donut email:pass`');
      }
      hitRunner.running = true;
      hitRunner.channelId = message.channel.id;
      hitRunner.index = 0;
      hitRunner.queue = [...data.hits];
      await message.reply(
        `🚀 **Hit run started** — **${hitRunner.queue.length}** hit(s), **5s** apart.\n\`$hit stop\` to cancel.`
      );
      runNextHit();
      return;
    }

    if (sub === 'stop') {
      if (!hitRunner.running) return message.reply('No hit run active.');
      await stopHitRunner('🛑 **Hit run stopped.**', message.channel);
      return;
    }

    if (sub === 'list' || sub === 'queue' || !sub) {
      const hits = data.hits || [];
      if (!hits.length) return message.reply('Hit queue empty.');
      const lines = hits.slice(0, 30).map((h, i) => {
        const flags = [
          h.hypixel === 'Available' ? 'Hyp' : null,
          h.donut === 'Available' ? 'Donut' : null
        ]
          .filter(Boolean)
          .join('+') || '—';
        return `\`#${i + 1}\` \`${h.email}\` · ${flags}`;
      });
      return message.reply(
        `**Hit queue:** **${hits.length}**\n${lines.join('\n')}` +
          (hits.length > 30 ? `\n…+${hits.length - 30} more` : '')
      );
    }

    if (sub === 'export') {
      const hits = data.hits || [];
      if (!hits.length) return message.reply('Nothing to export.');
      const lines = hits.map(
        (h) =>
          `${h.email}:${h.pass} | hyp=${h.hypixel} | donut=${h.donut}`
      );
      const chunks = [];
      let buf = '**Hit export (backup before redeploy)**\n```\n';
      for (const line of lines) {
        if ((buf + line + '\n').length > 1800) {
          chunks.push(buf + '```');
          buf = '```\n';
        }
        buf += line + '\n';
      }
      chunks.push(buf + '```');
      for (const c of chunks) await message.channel.send(c);
      return;
    }

    if (sub === 'clear') {
      const n = (data.hits || []).length;
      data.hits = [];
      saveData();
      return message.reply(`Cleared **${n}** hits.`);
    }

    if (sub === 'add') {
      // $hit add hypixel email:pass ...
      // $hit add donut email:pass ...
      // $hit add both email:pass ...
      const kind = (args[1] || '').toLowerCase();
      if (!['hypixel', 'hyp', 'donut', 'both', 'all'].includes(kind)) {
        return message.reply(
          'Usage:\n' +
            '`$hit add hypixel email:pass email:pass`\n' +
            '`$hit add donut email:pass ...`\n' +
            '`$hit add both email:pass ...`'
        );
      }
      const rest = body.slice(body.toLowerCase().indexOf(kind) + kind.length).trim();
      const accounts = parseAccounts(rest);
      if (!accounts.length) {
        return message.reply('No `email:pass` found.');
      }
      let hyp = 'Not Available';
      let don = 'Not Available';
      if (kind === 'hypixel' || kind === 'hyp' || kind === 'both' || kind === 'all') {
        hyp = 'Available';
      }
      if (kind === 'donut' || kind === 'both' || kind === 'all') {
        don = 'Available';
      }
      if (!data.hits) data.hits = [];
      for (const acc of accounts) {
        const idx = acc.indexOf(':');
        data.hits.push({
          email: acc.slice(0, idx),
          pass: acc.slice(idx + 1),
          type: 'MCFA',
          hypixel: hyp,
          donut: don,
          uploadedAt: new Date().toISOString(),
          by: message.author.id
        });
      }
      saveData();
      return message.reply(
        `Added **${accounts.length}** hit(s) · Hypixel: **${hyp}** · Donut: **${don}** · Queue: **${data.hits.length}**`
      );
    }

    return message.reply(
      '**Hits**\n' +
        '`$hit add hypixel email:pass ...`\n' +
        '`$hit add donut email:pass ...`\n' +
        '`$hit add both email:pass ...`\n' +
        '`$hit list` · `$hit start` · `$hit stop` · `$hit export` · `$hit clear`'
    );
  }



  // ========== $daily (Head Admin+) ==========
  // $daily @role [n]     — randomly pick n members from role, ping command user
  // $daily pay @user     — 5–8s spin UI → custom ~65% / MCFA ~35% → DM + vouch warning
  if (cmd === 'daily') {
    if (!isHeadAdminOrAbove(message.member)) {
      return message.reply('Head Admin or above only.');
    }

    const sub = (args[0] || '').toLowerCase();

    // ---- $daily pay @user ----
    if (sub === 'pay') {
      const user =
        message.mentions.users.first() ||
        (args[1] &&
          (await client.users.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null)));

      if (!user || user.bot) {
        return message.reply('Usage: `$daily pay @user`');
      }

      const hasCustom = (data.customStock || []).length > 0;
      const hasMcfa = (data.mcfaStock || []).length > 0;
      if (!hasCustom && !hasMcfa) {
        return message.reply('No **custom** or **MCFA** stock left for daily pay.');
      }

      // Weighted: 65% custom, 35% MCFA (if that stock empty, use the other)
      let pool = Math.random() < 0.65 ? 'custom' : 'mcfa';
      if (pool === 'custom' && !hasCustom) pool = 'mcfa';
      if (pool === 'mcfa' && !hasMcfa) pool = 'custom';

      const spinMs = 5000 + Math.floor(Math.random() * 3001); // 5–8s
      const spinEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎰 Daily Spin')
        .setDescription(
          `Spinning for ${user}…\n\n` +
            `⏳ Please wait **${(spinMs / 1000).toFixed(1)}s**\n` +
            `🎯 Pool: Custom **65%** · MCFA **35%**`
        )
        .setFooter({ text: `Hosted by ${message.author.username} • Ultimate Rewards` })
        .setTimestamp();

      const spinMsg = await message.reply({ embeds: [spinEmbed] });

      await new Promise((r) => setTimeout(r, spinMs));

      let rewardText = '';
      let rewardKind = pool;

      if (pool === 'custom') {
        const item = data.customStock.shift();
        data.customUsed.push({
          item,
          to: user.id,
          by: message.author.id,
          at: new Date().toISOString(),
          type: 'daily'
        });
        saveData();
        rewardText = item;
      } else {
        const account = data.mcfaStock.shift();
        data.mcfaUsed.push({
          account,
          to: user.id,
          by: message.author.id,
          at: new Date().toISOString(),
          type: 'daily'
        });
        saveData();
        rewardText = account;
      }

      const resultEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎉 Daily Spin Result')
        .setDescription(
          `${user} won **${rewardKind === 'custom' ? 'CUSTOM' : 'MCFA'}**!\n\n` +
            `Reward was sent to their **DMs**.\n` +
            `Stock left — Custom: **${data.customStock.length}** · MCFA: **${data.mcfaStock.length}**`
        )
        .setFooter({ text: `Spun by ${message.author.username}` })
        .setTimestamp();

      await spinMsg.edit({ embeds: [resultEmbed] }).catch(() =>
        message.channel.send({ embeds: [resultEmbed] })
      );

      const dmBody =
        `# ARE WE LEGIT?\n` +
        `-# vouch ${message.author.username} within this day or **1 week timeout**\n\n` +
        `**Your daily reward (${rewardKind === 'custom' ? 'CUSTOM' : 'MCFA'}):**\n` +
        `||${rewardText}||\n\n` +
        `Please post a **vouch** for **${message.author}** today.\n` +
        `Ignoring vouch may result in a **1 week timeout** (staff/admin enforced).\n\n` +
        `— Ultimate Rewards`;

      try {
        await user.send(dmBody);
      } catch (e) {
        // restore stock
        if (rewardKind === 'custom') {
          data.customStock.unshift(rewardText);
          data.customUsed.pop();
        } else {
          data.mcfaStock.unshift(rewardText);
          data.mcfaUsed.pop();
        }
        saveData();
        await message.channel.send(
          `Could not DM ${user} (DMs closed). Reward **returned** to stock.`
        );
      }
      return;
    }

    // ---- $daily @role [n] ----
    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get((args[0] || '').replace(/[<@&>]/g, ''));

    if (!role) {
      return message.reply(
        'Usage:\n' +
          '`$daily @role 5` — pick **5** random members from role (pings you)\n' +
          '`$daily pay @user` — spin daily reward (Custom 65% / MCFA 35%)'
      );
    }

    let n = 1;
    for (const a of args) {
      if (/^\d+$/.test(a)) {
        n = Math.min(25, Math.max(1, parseInt(a, 10)));
        break;
      }
    }

    try {
      await message.guild.members.fetch();
    } catch (_) {}

    const pool = [...role.members.filter((m) => !m.user.bot).values()];
    if (!pool.length) {
      return message.reply(`No human members in **${role.name}**.`);
    }

    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, Math.min(n, pool.length));

    const lines = picked.map((m, i) => `\`#${i + 1}\` ${m} (\`${m.user.username}\`)`);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎲 Daily Random Pick')
      .setDescription(
        `Role: ${role}\n` +
          `Requested: **${n}** · Picked: **${picked.length}**\n\n` +
          lines.join('\n')
      )
      .setFooter({ text: `Drawn by ${message.author.username}` })
      .setTimestamp();

    return message.reply({
      content: `${message.author} — your daily picks: ${picked.map((m) => m.toString()).join(' ')}`,
      embeds: [embed]
    });
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
          '`$mcfa export #channel` — upload export_N.txt of stock',
          '`$pay @user` / `$pay @user 10` — DM MCFA from stock',
          '`$hit add hypixel/donut/both` · `$hit start/stop/list/export` — hits',
          '',
          '**Salary**',
          '`$salary @user` / `$salary @user 3` — salary DM *(restricted)*',
          '',
          '**Custom Stock**',
          '`$custom` — custom stock count',
          '`$custom list` — show all custom items',
          '`$custom add <text>` — add custom item(s)',
          '`$custom clear` — clear custom stock',
          '`$custom export #channel` — upload export_N.txt',
          '`$custompay @user` — DM 1 item to one user',
          '`$custompay @role` — DM 1 item to every member in the role',
          '',
          '**Staff Management**',
          '$staffstats` — premium staff team overview',
          '`$claim` — claim invite reward (in tickets)',
          '`$daily @role N` — random pick from role *(Head Admin+)*',
          '`$daily pay @user` — daily spin Custom/MCFA *(Head Admin+)*',
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

