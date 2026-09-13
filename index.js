require('dotenv').config();
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
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || ''; // optional extra staff role
const PREFIX = process.env.PREFIX || '$';
const DATA_PATH = process.env.RENDER
  ? path.join('/tmp', 'best-bot-data.json')
  : path.join(__dirname, 'data.json');

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN');
  process.exit(1);
}

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Load error:', e.message);
  }
  return { messages: {}, invites: {}, inviteUses: {} };
}

function saveData(data) {
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
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel]
});

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) return true;
  // common staff-ish perms
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return false;
}

function scoreOf(userId, guildId) {
  const m = data.messages[guildId]?.[userId] || 0;
  const inv = data.invites[guildId]?.[userId] || 0;
  // Combined: 1 message = 1 pt, 1 invite = 25 pts (invites are rarer)
  return m + inv * 25;
}

function addMessage(guildId, userId) {
  if (!data.messages[guildId]) data.messages[guildId] = {};
  data.messages[guildId][userId] = (data.messages[guildId][userId] || 0) + 1;
  saveData(data);
}

function setInviteCount(guildId, userId, count) {
  if (!data.invites[guildId]) data.invites[guildId] = {};
  data.invites[guildId][userId] = count;
  saveData(data);
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
    saveData(data);
  } catch (e) {
    console.error('Invite cache failed for', guild.id, e.message);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    await cacheGuildInvites(guild);
  }
  // periodic save safety
  setInterval(() => saveData(data), 60_000);
});

client.on('inviteCreate', async (invite) => {
  try {
    if (!data.inviteUses[invite.guild.id]) data.inviteUses[invite.guild.id] = {};
    data.inviteUses[invite.guild.id][invite.code] = {
      uses: invite.uses || 0,
      inviterId: invite.inviter?.id || null
    };
    saveData(data);
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
      if ((inv.uses || 0) > before) {
        used = inv;
      }
    });

    // refresh cache
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
    saveData(data);
  } catch (e) {
    console.error('guildMemberAdd invite track:', e.message);
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  // count messages for stats
  addMessage(message.guild.id, message.author.id);

  if (!message.content.startsWith(PREFIX)) return;

  const body = message.content.slice(PREFIX.length).trim();
  const [cmd, ...rest] = body.split(/\s+/);
  if (!cmd) return;

  if (cmd.toLowerCase() !== 'best') return;

  if (!isStaff(message.member)) {
    return message.reply('Staff only.');
  }

  // Role: mention or ID
  const role =
    message.mentions.roles.first() ||
    (rest[0] && message.guild.roles.cache.get(rest[0].replace(/[<@&>]/g, '')));

  if (!role) {
    return message.reply('Usage: `$best @role`\nExample: `$best @Members`');
  }

  // Ensure members cached
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
    .setFooter({
      text: 'Score = messages + (invites × 25) · Counts from when this bot was added'
    })
    .setTimestamp();

  return message.reply({ embeds: [embed] });
});

client.login(TOKEN);
