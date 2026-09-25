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
  AttachmentBuilder,
  SlashCommandBuilder,
  Collection
} = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '';
const PREFIX = process.env.PREFIX || '$';
const PORT = process.env.PORT || 3000;
const DASHBOARD_ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || 'ultimate-admin';
const LEVEL_XP_MIN = 25;
const LEVEL_XP_MAX = 40;
const LEVEL_COOLDOWN_MS = 12_000; // XP every 12s while chatting


// Staff role hierarchy for $staffstats (highest first)
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || '1547183159794204675'; // Owner

const FOUNDER_ROLE_ID = process.env.FOUNDER_ROLE_ID || '1547183159794204675';
const DISCORD_DEV_ROLE_ID = process.env.DISCORD_DEV_ROLE_ID || '1545279142411509840';
const CEO_ROLE_ID = process.env.CEO_ROLE_ID || '1545321225994371143';
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1545309154644590612';
const CO_OWNER_ROLE_ID = process.env.CO_OWNER_ROLE_ID || '1547183161300090950'; // Co-owner
const MANAGER_ROLE_ID = process.env.MANAGER_ROLE_ID || '1549036072909021285'; // Manager
const HEAD_ADMIN_ROLE_ID = process.env.HEAD_ADMIN_ROLE_ID || '1547183162457718847'; // Head admin
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || '1547183164185911356'; // Admin
const STAFF_TEAM_ROLE_ID = process.env.STAFF_TEAM_ROLE_ID || '1548173330794815599'; // Staff
const REWARD_STAFF_ROLE_ID = process.env.REWARD_STAFF_ROLE_ID || '1548173330794815599';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || ''; // optional: auto-prompt in new tickets
const STAFF_CHAT_CHANNEL_ID = process.env.STAFF_CHAT_CHANNEL_ID || '1547183225317883954';
const STAFF_CMD_CHANNEL_ID = process.env.STAFF_CMD_CHANNEL_ID || '1547183226827702312';

// Anti-raid settings
const ANTIRAID_LOG_CHANNEL_ID = process.env.ANTIRAID_LOG_CHANNEL_ID || ''; // optional log channel
const TEAMUP_CATEGORY_ID = process.env.TEAMUP_CATEGORY_ID || ''; // optional category for teamup tickets
const MASS_PING_LIMIT = 3;          // same user mentioned this many times
const MASS_PING_WINDOW_MS = 15000;  // within 15 seconds
const MASS_PING_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000; // 3 days


// Product stock keys (Ultimate multi-stock)
const PRODUCT_STOCKS = {
  // emojiNames = exact names of YOUR server custom emojis
  mcfa: { label: 'MCFA', emoji: '', emojiNames: ['MINECRAFT', 'minecraft', 'mcfa'], cmd: ['mcfa'] },
  donut: { label: 'DONUT', emoji: '', emojiNames: ['donut', 'Donut'], cmd: ['donut'] },
  hypixel: { label: 'HYPIXEL', emoji: '', emojiNames: ['hypixel', 'Hypixel'], cmd: ['hypixel', 'hyp'] },
  nitro: { label: 'NITRO PROMO', emoji: '', emojiNames: ['Nitro', 'nitro'], cmd: ['nitro'] },
  netflix: { label: 'NETFLIX', emoji: '', emojiNames: ['netflix', 'Netflix'], cmd: ['netflix'] },
  steam: { label: 'STEAM', emoji: '', emojiNames: ['STEAM', 'steam', 'Steam'], cmd: ['steam'] },
  crunchyroll: { label: 'CRUNCHYROLL', emoji: '', emojiNames: ['crunchyroll', 'Crunchyroll'], cmd: ['crunchyroll', 'cruncyroll', 'cr'] },
  xbox: { label: 'XBOX', emoji: '', emojiNames: ['xbox', 'Xbox', 'XBOX'], cmd: ['xbox'] },
  custom: { label: 'CUSTOM', emoji: '', emojiNames: ['custom'], cmd: ['custom'] }
};

/** Prefer guild custom emoji by name, else plain text */
function e(guild, names, fallback = '•') {
  if (!guild || !guild.emojis) return fallback || '•';
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    if (!name) continue;
    const found = guild.emojis.cache.find(
      (em) => em.name && em.name.toLowerCase() === String(name).toLowerCase()
    );
    if (found) return found.toString(); // <:name:id>
  }
  return fallback || '•';
}

function productEmoji(guild, key) {
  const meta = PRODUCT_STOCKS[key];
  if (!meta) return '•';
  const names = [
    ...(meta.emojiNames || []),
    key,
    meta.label,
    ...(meta.cmd || [])
  ];
  return e(guild, names, meta.emoji || '•');
}


const VOUCH_CHANNEL_ID = process.env.VOUCH_CHANNEL_ID || '1547183217449242644';
const PROOF_CHANNEL_ID = process.env.PROOF_CHANNEL_ID || '1547183218875301968';
const SALARY_ADD_CHANNEL_ID = process.env.SALARY_ADD_CHANNEL_ID || '1547183228115222549';
const BIRTHDAY_USER_ID = process.env.BIRTHDAY_USER_ID || '1398979148063571989';
const FALCON_BOT_ID = process.env.FALCON_BOT_ID || '899899858981371935'; // Falcon™

const FREE_GEN_ROLE_ID = process.env.FREE_GEN_ROLE_ID || '1550508537766215773';
const PAID_GEN_ROLE_ID = process.env.PAID_GEN_ROLE_ID || '1550509503710240953';
const FREE_STATUS_TEXT = process.env.FREE_STATUS_TEXT || 'Legit mcfas on discord.gg/r9spJKVbsM';
const MEDIA_ROLE_ID = process.env.MEDIA_ROLE_ID || '1540362727560843365';
const OUR_BOTS_ROLE_ID = process.env.OUR_BOTS_ROLE_ID || '1540362727560843367';
const OWNZ_ROLE_ID = process.env.OWNZ_ROLE_ID || '1540615105039827065';
const DIRECTOR_ROLE_ID = process.env.DIRECTOR_ROLE_ID || '1540362727514701897';
const ULTIMATE_WEB = process.env.ULTIMATE_WEB || 'https://ultimate-rewards.onrender.com';
const STAFF_APPLY_PING_ROLES = [OWNER_ROLE_ID, CO_OWNER_ROLE_ID].filter(Boolean);

function ensureStocks(d) {
  if (!d.stocks || typeof d.stocks !== 'object') d.stocks = {};
  for (const key of Object.keys(PRODUCT_STOCKS)) {
    if (!Array.isArray(d.stocks[key])) d.stocks[key] = [];
  }
  // migrate legacy
  if (Array.isArray(d.mcfaStock) && d.mcfaStock.length && d.stocks.mcfa.length === 0) {
    d.stocks.mcfa = d.mcfaStock.slice();
  }
  if (Array.isArray(d.customStock) && d.customStock.length && d.stocks.custom.length === 0) {
    d.stocks.custom = d.customStock.slice();
  }
  d.mcfaStock = d.stocks.mcfa;
  d.customStock = d.stocks.custom;
  if (!d.staffApplyOpen) d.staffApplyOpen = true;
  if (!d.staffApplications) d.staffApplications = {};
  return d;
}

function getStock(key) {
  ensureStocks(data);
  return data.stocks[key] || [];
}

function setStock(key, arr) {
  ensureStocks(data);
  data.stocks[key] = arr;
  if (key === 'mcfa') data.mcfaStock = arr;
  if (key === 'custom') data.customStock = arr;
}

function resolveProductKey(name) {
  const n = String(name || '').toLowerCase();
  for (const [key, meta] of Object.entries(PRODUCT_STOCKS)) {
    if (key === n || meta.cmd.includes(n) || meta.label.toLowerCase() === n) return key;
  }
  return null;
}

function buildStockListEmbed(guild) {
  ensureStocks(data);
  const count = (key) => (data.stocks[key] || []).length;
  const line = (label, key) => {
    const mark = productEmoji(guild, key);
    return `${mark} **${label}**  |  \`${count(key)}\``;
  };

  const booster = [
    line('NITRO PROMO', 'nitro'),
    line('XBOX', 'xbox'),
    line('CRUNCHYROLL', 'crunchyroll')
  ].join('\n');

  const general = [
    line('DONUT', 'donut'),
    line('MCFA', 'mcfa'),
    line('HYPIXEL', 'hypixel'),
    line('NETFLIX', 'netflix'),
    line('STEAM', 'steam'),
    line('CUSTOM', 'custom')
  ].join('\n');

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('CURRENT STOCK STATUS')
    .setDescription(
      `**BOOSTER ACCESS**\n${booster}\n\n` +
        `**GENERAL STOCK**\n${general}\n\n` +
        `Use \`$buy <product>\` or \`$pay @user\` to deliver`
    )
    .setFooter({ text: 'Ultimate Rewards · Stock' })
    .setTimestamp();
}


function isStaffApplyChannel(ch) {
  if (!ch || !ch.name) return false;
  const n = ch.name.toLowerCase();
  return n.startsWith('staff-apply') || n.startsWith('staffapply') || n.includes('staff-apply');
}

function isTicketChannel(ch) {

  if (!ch || !ch.name) return false;
  const name = ch.name.toLowerCase();
  return (
    name.startsWith('ticket') ||
    name.startsWith('claim') ||
    name.includes('ticket') ||
    (TICKET_CATEGORY_ID && ch.parentId === TICKET_CATEGORY_ID)
  );
}


const DATA_PATH = process.env.RENDER
  ? path.join('/tmp', 'ultimate-bot-data.json')
  : path.join(__dirname, 'data.json');

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN');
  process.exit(1);
}

const DASH_COOKIE = 'ur_dash_uid';
const DEFAULT_GUILD_ID = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || '';
const OAUTH_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || process.env.CLIENT_SECRET || '';
const OAUTH_REDIRECT =
  process.env.OAUTH_REDIRECT_URI ||
  process.env.REDIRECT_URI ||
  ''; // e.g. https://ultimate-staff.onrender.com/auth/callback

const dashSessions = new Map(); // uid -> { at }

function parseBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('=') || '');
  }
  return '';
}

function setUidCookie(res, uid) {
  res.setHeader(
    'Set-Cookie',
    `${DASH_COOKIE}=${encodeURIComponent(uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
  );
}

function clearUidCookie(res) {
  res.setHeader('Set-Cookie', `${DASH_COOKIE}=; Path=/; Max-Age=0`);
}

function getLoggedUid(req) {
  const uid = getCookie(req, DASH_COOKIE);
  if (!uid || !dashSessions.has(uid)) return null;
  return uid;
}

async function memberCanAccessDashboard(userId) {
  try {
    if (!client?.isReady?.() && !client?.user) return false;
    const guildId = DEFAULT_GUILD_ID || client.guilds.cache.first()?.id;
    if (!guildId) return false;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    if (isCoOwnerOrAbove(member) || isHeadAdminOrAbove(member) || isStaff(member)) return true;
    // Server owner always
    if (guild.ownerId && String(guild.ownerId) === String(userId)) return true;
    return false;
  } catch (e) {
    console.error('dash auth:', e.message);
    return false;
  }
}

function publicBase(req) {
  if (OAUTH_REDIRECT) {
    try {
      const u = new URL(OAUTH_REDIRECT);
      return `${u.protocol}//${u.host}`;
    } catch (_) {}
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function redirectUri(req) {
  if (OAUTH_REDIRECT) return OAUTH_REDIRECT;
  return `${publicBase(req)}/auth/callback`;
}


http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathName = url.pathname;
    const json = (code, obj, extraHeaders = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...extraHeaders });
      res.end(JSON.stringify(obj));
    };

    try {
      if (pathName === '/health' || pathName === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      // Discord OAuth login
      if (pathName === '/auth/login') {
        if (!OAUTH_CLIENT_ID) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in env');
          return;
        }
        const redir = encodeURIComponent(redirectUri(req));
        const scope = encodeURIComponent('identify');
        const authUrl =
          `https://discord.com/api/oauth2/authorize?client_id=${OAUTH_CLIENT_ID}` +
          `&redirect_uri=${redir}&response_type=code&scope=${scope}`;
        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
      }

      if (pathName === '/auth/callback') {
        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code');
          return;
        }
        const redir = redirectUri(req);
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: OAUTH_CLIENT_ID,
            client_secret: OAUTH_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redir
          })
        });
        const tokenJson = await tokenRes.json();
        if (!tokenRes.ok || !tokenJson.access_token) {
          console.error('oauth token', tokenJson);
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('OAuth token failed. Check CLIENT_SECRET and Redirect URI.');
          return;
        }
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` }
        });
        const user = await userRes.json();
        if (!user?.id) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Could not load Discord user');
          return;
        }
        const allowed = await memberCanAccessDashboard(user.id);
        if (!allowed) {
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end(
            '<h2>Access denied</h2><p>You need Staff / Manager / Owner role or Administrator / Manage Server permission on the Ultimate Rewards server.</p><a href="/">Back</a>'
          );
          return;
        }
        dashSessions.set(user.id, {
          at: Date.now(),
          tag: `${user.username}${user.discriminator && user.discriminator !== '0' ? '#' + user.discriminator : ''}`
        });
        setUidCookie(res, user.id);
        res.writeHead(302, { Location: '/dashboard' });
        res.end();
        return;
      }

      if (pathName === '/auth/logout') {
        const uid = getLoggedUid(req);
        if (uid) dashSessions.delete(uid);
        clearUidCookie(res);
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }

      // Static site (index.html + css + js) — one project with the bot
      if (pathName === '/' || pathName === '/dashboard') {
        const htmlPath = path.join(__dirname, 'public', 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(htmlPath, 'utf8'));
        return;
      }
      if (pathName === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8'));
        return;
      }
      if (pathName === '/app.js' || pathName === '/script.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8'));
        return;
      }
      if (pathName === '/logo.png') {
        const img = path.join(__dirname, 'public', 'logo.png');
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
        res.end(fs.readFileSync(img));
        return;
      }
      // Background + any public image (jpg/png/webp/gif)
      if (
        pathName === '/bg-desktop.jpg' ||
        pathName === '/bg-mobile.jpg' ||
        pathName === '/bg-desktop.png' ||
        pathName === '/bg-mobile.png' ||
        pathName === '/bg-desktop.webp' ||
        pathName === '/bg-mobile.webp' ||
        pathName === '/logo.png' ||
        pathName === '/logo.jpg' ||
        pathName.startsWith('/bg-')
      ) {
        const file = path.join(__dirname, 'public', path.basename(pathName));
        if (!fs.existsSync(file)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        const ext = path.extname(file).toLowerCase();
        const types = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif'
        };
        const type = types[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'no-cache, max-age=0, must-revalidate'
        });
        res.end(fs.readFileSync(file));
        return;
      }

      if (pathName === '/api/status') {
        const uid = getLoggedUid(req);
        let authed = false;
        let userTag = null;
        let err;
        let hint;
        if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
          err = 'Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET in Render env';
          hint = 'Add OAuth credentials + redirect https://staff-bot-7gc5.onrender.com/auth/callback';
        }
        if (uid) {
          authed = await memberCanAccessDashboard(uid);
          if (!authed) {
            dashSessions.delete(uid);
            err = 'Logged in but not staff on this server';
            hint = 'Need Owner/Manager/Staff role or Administrator / Manage Server. Set GUILD_ID correctly.';
          } else userTag = dashSessions.get(uid)?.tag || uid;
        }
        let guildInfo = null;
        const gid = DEFAULT_GUILD_ID || client?.guilds?.cache?.first()?.id;
        if (client?.guilds && gid) {
          const g = client.guilds.cache.get(gid);
          if (g) {
            guildInfo = {
              id: g.id,
              name: g.name,
              memberCount: g.memberCount,
              channels: g.channels?.cache?.size,
              roles: g.roles?.cache?.size
            };
          }
        }
        if (!data.protection) {
          data.protection = { antinuke: true, antibetray: true, automod: false, badWords: 'scam,fuck' };
        }
        let avatar = null;
        if (uid) {
          avatar = `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(uid) >> 22n) % 6}.png`;
          try {
            const u = await client.users.fetch(uid).catch(() => null);
            if (u) avatar = u.displayAvatarURL({ size: 128 });
          } catch (_) {}
        }
        return json(200, {
          online: !!(typeof client !== 'undefined' && client?.user),
          tag: client?.user?.tag || null,
          guilds: client?.guilds?.cache?.size || 0,
          defaultGuildId: gid || '',
          authed,
          userId: authed ? uid : null,
          userTag,
          avatar,
          guild: guildInfo,
          error: err,
          hint,
          protection: data.protection,
          settings: {
            aiChannelId: data.aiChannelId || null,
            autoExportMinutes: data.autoExportMinutes || 0,
            autoExportChannelId: data.autoExportChannelId || null,
            birthdayUserId: data.birthdayUserId || process.env.BIRTHDAY_USER_ID || null
          }
        });
      }

      // Protected APIs
      if (pathName.startsWith('/api/')) {
        const uid = getLoggedUid(req);
        if (!uid || !(await memberCanAccessDashboard(uid))) {
          return json(401, { error: 'Login with Discord (staff only)' });
        }
      }

      if (pathName === '/api/user' && req.method === 'GET') {
        const guildId = url.searchParams.get('guildId') || DEFAULT_GUILD_ID;
        const userId = url.searchParams.get('userId');
        if (!guildId || !userId) return json(400, { error: 'guildId and userId required' });
        return json(200, {
          guildId,
          userId,
          invites: data.invites?.[guildId]?.[userId] || 0,
          messages: data.messages?.[guildId]?.[userId] || 0
        });
      }

      if (pathName === '/api/user' && req.method === 'POST') {
        const body = await parseBody(req);
        const guildId = String(body.guildId || DEFAULT_GUILD_ID || '');
        const userId = String(body.userId || '');
        if (!guildId || !userId) return json(400, { error: 'guildId and userId required' });
        if (!data.invites[guildId]) data.invites[guildId] = {};
        if (!data.messages[guildId]) data.messages[guildId] = {};
        const inv = Math.max(0, parseInt(body.invites, 10) || 0);
        const msg = Math.max(0, parseInt(body.messages, 10) || 0);
        data.invites[guildId][userId] = inv;
        data.messages[guildId][userId] = msg;
        if (!data.falconInvites) data.falconInvites = {};
        if (!data.falconInvites[guildId]) data.falconInvites[guildId] = {};
        data.falconInvites[guildId][userId] = { count: inv, at: new Date().toISOString(), source: 'dashboard' };
        if (!data.falconMessages) data.falconMessages = {};
        if (!data.falconMessages[guildId]) data.falconMessages[guildId] = {};
        data.falconMessages[guildId][userId] = { count: msg, at: new Date().toISOString(), source: 'dashboard' };
        saveData();
        return json(200, { ok: true, invites: inv, messages: msg });
      }

      if (pathName === '/api/top') {
        const kind = url.searchParams.get('kind') || 'inv';
        const guildId =
          url.searchParams.get('guildId') ||
          DEFAULT_GUILD_ID ||
          client?.guilds?.cache?.first()?.id;
        const map = kind === 'msg' ? data.messages?.[guildId] || {} : data.invites?.[guildId] || {};
        const rows = Object.entries(map)
          .map(([userId, count]) => ({ userId, count: Number(count) || 0 }))
          .filter((r) => r.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 25);
        return json(200, { rows });
      }


      if (pathName === '/api/protection' && req.method === 'POST') {
        const body = await parseBody(req);
        data.protection = {
          antinuke: !!body.antinuke,
          antibetray: !!body.antibetray,
          automod: !!body.automod,
          badWords: String(body.badWords || data.protection?.badWords || 'scam,fuck')
        };
        saveData();
        return json(200, { ok: true, protection: data.protection });
      }
      if (pathName === '/api/stock' && req.method === 'GET') {
        ensureStocks(data);
        const stocks = {};
        for (const key of Object.keys(PRODUCT_STOCKS || {})) {
          stocks[key] = (data.stocks?.[key] || []).length;
        }
        return json(200, { stocks });
      }
      if (pathName === '/api/stock' && req.method === 'POST') {
        const body = await parseBody(req);
        const product = resolveProductKey(body.product) || body.product;
        if (!product || !PRODUCT_STOCKS[product]) return json(400, { error: 'Unknown product' });
        ensureStocks(data);
        const lines = String(body.lines || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (!data.stocks[product]) data.stocks[product] = [];
        data.stocks[product].push(...lines);
        if (product === 'mcfa') data.mcfaStock = data.stocks.mcfa;
        if (product === 'custom') data.customStock = data.stocks.custom;
        saveData();
        return json(200, { added: lines.length, total: data.stocks[product].length });
      }
      if (pathName === '/api/methods' && req.method === 'GET') {
        if (!data.methodTexts) data.methodTexts = {};
        const list = Object.entries(data.methodTexts).map(([name, body]) => ({
          name,
          length: String(body || '').length,
          preview: String(body || '').slice(0, 120),
          body: String(body || '')
        }));
        return json(200, {
          methods: list,
          catalog: typeof METHOD_CATALOG !== 'undefined' ? METHOD_CATALOG : [],
          inviteRewards: typeof REWARD_TIERS !== 'undefined' ? REWARD_TIERS : [],
          messageRewards: typeof MESSAGE_REWARDS !== 'undefined' ? MESSAGE_REWARDS : []
        });
      }
      if (pathName === '/api/methods' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!data.methodTexts) data.methodTexts = {};
        const action = String(body.action || 'set').toLowerCase();
        const name = String(body.name || '').trim();
        if (!name) return json(400, { error: 'name required' });
        if (action === 'delete' || action === 'del') {
          if (data.methodTexts[name]) {
            delete data.methodTexts[name];
            saveData();
            return json(200, { ok: true, deleted: name });
          }
          return json(404, { error: 'not found' });
        }
        const content = String(body.content || body.text || '').trim();
        if (!content) return json(400, { error: 'content required' });
        data.methodTexts[name] = content;
        saveData();
        return json(200, { ok: true, name, length: content.length });
      }


      if (pathName === '/api/giveaways' && req.method === 'GET') {
        const list = Object.entries(data.giveaways || {}).map(([id, g]) => ({
          id,
          prize: g.prize,
          winners: g.winners,
          entries: (g.entries || []).length,
          ended: !!g.ended,
          endsAt: g.endsAt,
          channelId: g.channelId,
          hostId: g.hostId,
          winnerIds: g.winnerIds || []
        }));
        list.sort((a, b) => (b.endsAt || 0) - (a.endsAt || 0));
        return json(200, { giveaways: list });
      }

      if (pathName === '/api/levels' && req.method === 'GET') {
        const guildId = url.searchParams.get('guildId') || '';
        const map = data.levels?.[guildId] || {};
        const list = Object.entries(map)
          .map(([userId, v]) => ({
            userId,
            xp: v.xp || 0,
            level: v.level || levelFromXp(v.xp || 0)
          }))
          .sort((a, b) => b.xp - a.xp)
          .slice(0, 50);
        return json(200, { guildId, levels: list });
      }

      if (pathName === '/api/servers' && req.method === 'GET') {
        const guilds = [];
        for (const [, g] of client.guilds.cache) {
          guilds.push({
            id: g.id,
            name: g.name,
            memberCount: g.memberCount,
            icon: g.iconURL({ size: 64 }),
            configured: !!(data.serverConfigs && data.serverConfigs[g.id])
          });
        }
        return json(200, { servers: guilds });
      }

      if (pathName === '/api/servers/config' && req.method === 'POST') {
        const body = await parseBody(req);
        const password = String(body.password || '');
        if (password !== DASHBOARD_ADMIN_PASSWORD) {
          return json(403, { error: 'Invalid admin password' });
        }
        const guildId = String(body.guildId || '');
        if (!guildId) return json(400, { error: 'guildId required' });
        if (!data.serverConfigs) data.serverConfigs = {};
        data.serverConfigs[guildId] = {
          ...(data.serverConfigs[guildId] || {}),
          ...(body.config || {}),
          updatedAt: new Date().toISOString()
        };
        saveData();
        return json(200, { ok: true, config: data.serverConfigs[guildId] });
      }

      if (pathName === '/api/falcon/sync' && req.method === 'GET') {
        const guildId = url.searchParams.get('guildId') || '';
        return json(200, {
          invites: data.falconInvites?.[guildId] || data.falconInvites || {},
          messages: data.falconMessages?.[guildId] || data.falconMessages || {}
        });
      }

      if (pathName === '/api/hits' && req.method === 'GET') {
        return json(200, { count: (data.hits || []).length });
      }
      if (pathName === '/api/hits' && req.method === 'DELETE') {
        data.hits = [];
        saveData();
        return json(200, { ok: true });
      }
      if (pathName === '/api/economy' && req.method === 'GET') {
        const userId = url.searchParams.get('userId');
        if (!userId) return json(400, { error: 'userId required' });
        return json(200, { userId, coins: data.coins?.[userId] || 0 });
      }
      if (pathName === '/api/economy' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.userId) return json(400, { error: 'userId required' });
        if (!data.coins) data.coins = {};
        data.coins[body.userId] = Math.max(0, parseInt(body.coins, 10) || 0);
        saveData();
        return json(200, { ok: true, coins: data.coins[body.userId] });
      }
      if (pathName === '/api/settings' && req.method === 'POST') {
        const body = await parseBody(req);
        if (body.aiChannelId !== undefined) data.aiChannelId = body.aiChannelId || null;
        if (body.autoExportMinutes !== undefined) {
          data.autoExportMinutes = Math.max(0, parseInt(body.autoExportMinutes, 10) || 0);
        }
        if (body.autoExportChannelId !== undefined) {
          data.autoExportChannelId = body.autoExportChannelId || null;
        }
        if (body.birthdayUserId !== undefined) {
          data.birthdayUserId = body.birthdayUserId || null;
        }
        saveData();
        scheduleAutoExport();
        return json(200, { ok: true });
      }

      // ===== Dashboard: tickets, channels, chat, toggles =====
      if (pathName === '/api/tickets' && req.method === 'GET') {
        const gid = DEFAULT_GUILD_ID || client?.guilds?.cache?.first()?.id;
        const guild = gid ? await client.guilds.fetch(gid).catch(() => null) : null;
        if (!guild) return json(200, { tickets: [] });
        await guild.channels.fetch().catch(() => {});
        const tickets = [];
        for (const [, ch] of guild.channels.cache) {
          if (ch.type !== 0 && ch.type !== 5) continue; // text / announcement
          const n = (ch.name || '').toLowerCase();
          if (
            n.includes('ticket') ||
            n.startsWith('closed-') ||
            n.includes('support') ||
            n.startsWith('staff-apply') ||
            (TICKET_CATEGORY_ID && String(ch.parentId) === String(TICKET_CATEGORY_ID))
          ) {
            tickets.push({
              id: ch.id,
              name: ch.name,
              parent: ch.parent?.name || null,
              topic: ch.topic || null
            });
          }
        }
        tickets.sort((a, b) => a.name.localeCompare(b.name));
        return json(200, { tickets });
      }

      if (pathName === '/api/channels/staff' && req.method === 'GET') {
        return json(200, {
          staffChat: STAFF_CHAT_CHANNEL_ID,
          staffCmd: STAFF_CMD_CHANNEL_ID
        });
      }

      if (pathName === '/api/messages' && req.method === 'GET') {
        const channelId = url.searchParams.get('channelId');
        if (!channelId) return json(400, { error: 'channelId required' });
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!ch || !ch.isTextBased?.()) return json(404, { error: 'Channel not found' });
        const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '40', 10));
        const msgs = await ch.messages.fetch({ limit }).catch(() => null);
        if (!msgs) return json(500, { error: 'Cannot fetch messages' });
        const list = [...msgs.values()]
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map((m) => ({
            id: m.id,
            content: m.content || (m.embeds?.[0]?.description ? '[embed] ' + (m.embeds[0].title || m.embeds[0].description).slice(0, 120) : m.attachments?.size ? '[attachment]' : ''),
            author: m.author?.username || 'Unknown',
            authorId: m.author?.id,
            avatar: m.author?.displayAvatarURL?.({ size: 64 }) || null,
            bot: !!m.author?.bot,
            time: m.createdTimestamp
          }));
        return json(200, { channelId, name: ch.name, messages: list });
      }

      if (pathName === '/api/messages' && req.method === 'POST') {
        const body = await parseBody(req);
        const channelId = body.channelId;
        const content = String(body.content || '').trim().slice(0, 2000);
        if (!channelId || !content) return json(400, { error: 'channelId + content required' });
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!ch || !ch.isTextBased?.()) return json(404, { error: 'Channel not found' });
        const sent = await ch.send({ content }).catch((e) => ({ error: e.message }));
        if (sent.error) return json(500, { error: sent.error });
        return json(200, { ok: true, id: sent.id });
      }

      if (pathName === '/api/toggles' && req.method === 'GET') {
        if (!data.protection) data.protection = {};
        if (!data.toggles) data.toggles = {};
        return json(200, {
          protection: {
            antinuke: !!data.protection.antinuke,
            antibetray: !!data.protection.antibetray,
            automod: !!data.protection.automod,
            antiraid: data.protection.antiraid !== false,
            badWords: data.protection.badWords || 'scam,fuck'
          },
          toggles: {
            staffApplyOpen: data.staffApplyOpen !== false,
            aiEnabled: data.toggles.aiEnabled !== false,
            hitsEnabled: data.toggles.hitsEnabled !== false,
            giveawaysEnabled: data.toggles.giveawaysEnabled !== false,
            freeGenEnabled: data.toggles.freeGenEnabled !== false,
            paidGenEnabled: data.toggles.paidGenEnabled !== false,
            claimEnabled: data.toggles.claimEnabled !== false,
            autoTicketCleanup: data.toggles.autoTicketCleanup !== false
          },
          settings: {
            aiChannelId: data.aiChannelId || '',
            autoExportMinutes: data.autoExportMinutes || 0,
            autoExportChannelId: data.autoExportChannelId || '',
            birthdayUserId: data.birthdayUserId || ''
          }
        });
      }

      if (pathName === '/api/toggles' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!data.protection) data.protection = {};
        if (!data.toggles) data.toggles = {};
        if (body.protection) {
          for (const k of ['antinuke', 'antibetray', 'automod', 'antiraid']) {
            if (body.protection[k] !== undefined) data.protection[k] = !!body.protection[k];
          }
          if (body.protection.badWords !== undefined) data.protection.badWords = String(body.protection.badWords);
        }
        if (body.toggles) {
          for (const [k, v] of Object.entries(body.toggles)) {
            if (k === 'staffApplyOpen') data.staffApplyOpen = !!v;
            else data.toggles[k] = !!v;
          }
        }
        if (body.settings) {
          if (body.settings.aiChannelId !== undefined) data.aiChannelId = body.settings.aiChannelId || null;
          if (body.settings.autoExportMinutes !== undefined)
            data.autoExportMinutes = Math.max(0, parseInt(body.settings.autoExportMinutes, 10) || 0);
          if (body.settings.autoExportChannelId !== undefined)
            data.autoExportChannelId = body.settings.autoExportChannelId || null;
          if (body.settings.birthdayUserId !== undefined) data.birthdayUserId = body.settings.birthdayUserId || null;
          scheduleAutoExport?.();
        }
        saveData();
        return json(200, { ok: true });
      }

      if (pathName === '/api/export' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="ultimate-data.json"'
        });
        res.end(JSON.stringify(data, null, 2));
        return;
      }
      if (pathName === '/api/import' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body || typeof body !== 'object') return json(400, { error: 'Invalid JSON' });
        // merge carefully
        for (const k of Object.keys(body)) {
          data[k] = body[k];
        }
        ensureStocks(data);
        saveData();
        scheduleAutoExport();
        return json(200, { ok: true });
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (e) {
      console.error('HTTP:', e.message);
      json(500, { error: e.message });
    }
  })
  .listen(PORT, '0.0.0.0', () =>
    console.log(`Dashboard (Discord OAuth) on port ${PORT}`)
  );

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
      if (!d.methodTexts) d.methodTexts = {}; // name -> text body (unlimited)
      if (!Array.isArray(d.hits)) d.hits = [];
      if (!d.exportCounts) d.exportCounts = { mcfa: 0, custom: 0, hits: 0 };
      ensureStocks(d);
      if (typeof d.staffApplyOpen !== 'boolean') d.staffApplyOpen = true;
      if (!d.staffApplications) d.staffApplications = {};
      if (!d.falconInvites) d.falconInvites = {};
      if (!d.falconMessages) d.falconMessages = {};
      if (!d.giveaways) d.giveaways = {};
      if (!d.levels) d.levels = {}; // guildId -> userId -> { xp, level }
      if (!d.serverConfigs) d.serverConfigs = {}; // guildId -> settings

      if (!d.protection) d.protection = { antinuke: true, antibetray: true, automod: false, badWords: 'scam,fuck' };
      if (!d.aiChannelId) d.aiChannelId = null;
      if (d.autoExportMinutes == null) d.autoExportMinutes = 0;
      if (!d.autoExportChannelId) d.autoExportChannelId = null;
      if (!d.birthdayUserId) d.birthdayUserId = null;
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
    methodTexts: {},
    hits: [],
    exportCounts: { mcfa: 0, custom: 0, hits: 0 },
    stocks: {},
    staffApplyOpen: true,
    staffApplications: {}
  };
  // note: ensureStocks applied after load below
}

function saveData() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Save error:', e.message);
  }
}

let data = loadData();
ensureStocks(data);

let autoExportTimer = null;
function scheduleAutoExport() {
  if (autoExportTimer) clearInterval(autoExportTimer);
  autoExportTimer = null;
  const mins = Number(data.autoExportMinutes || 0);
  if (!mins || mins < 1) return;
  autoExportTimer = setInterval(async () => {
    try {
      const chId = data.autoExportChannelId;
      if (!chId || !client?.isReady?.()) return;
      const ch = await client.channels.fetch(chId).catch(() => null);
      if (!ch || !ch.send) return;
      const { AttachmentBuilder } = require('discord.js');
      const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
      await ch.send({
        content: `📦 **Auto export** <t:${Math.floor(Date.now()/1000)}:R>`,
        files: [new AttachmentBuilder(buf, { name: `ultimate-auto-export.json` })]
      });
    } catch (e) {
      console.error('auto export:', e.message);
    }
  }, mins * 60 * 1000);
  console.log('Auto export every', mins, 'minutes');
}


scheduleAutoExport();

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
  // Discord permissions (server Owner-like / high staff) — not only role IDs
  try {
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  } catch (_) {}
  if (OWNER_ROLE_ID && member.roles.cache.has(OWNER_ROLE_ID)) return true;
  if (CO_OWNER_ROLE_ID && member.roles.cache.has(CO_OWNER_ROLE_ID)) return true;
  if (MANAGER_ROLE_ID && member.roles.cache.has(MANAGER_ROLE_ID)) return true;
  return false;
}

function isHeadAdminOrAbove(member) {
  if (!member) return false;
  try {
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  } catch (_) {}
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
  // Invite rewards
  { id: 1, invites: 2, name: 'MCFA', type: 'reward' },
  { id: 2, invites: 4, name: 'Xbox Code', type: 'reward' },
  { id: 3, invites: 5, name: 'MCFA — Hypixel Unbanned', type: 'reward' },
  { id: 4, invites: 7, name: '3 Hotmail Accounts', type: 'reward' },
  { id: 5, invites: 8, name: 'Stream Accounts', type: 'reward' },
  { id: 6, invites: 10, name: 'Netflix Premium — PC Login', type: 'reward' },
  { id: 7, invites: 12, name: 'Crunchyroll Premium', type: 'reward' },
  // Exclusive method rewards (invite unlocks)
  { id: 8, invites: 2, name: 'MC Redeem Code Method', type: 'method' },
  { id: 9, invites: 4, name: 'Nitro Basic Yearly Method', type: 'method' },
  { id: 10, invites: 5, name: 'MCFA Email Change Method', type: 'method' },
  { id: 11, invites: 8, name: 'MCFA Password Change Method', type: 'method' },
  { id: 12, invites: 12, name: '5,000 Robux Method', type: 'method' },
  { id: 13, invites: 15, name: 'Amazon Prime Method', type: 'method' },
  { id: 14, invites: 18, name: 'Legit Xbox Gift Card Method', type: 'method' },
  { id: 15, invites: 20, name: '30× Boost Method', type: 'method' },
  { id: 16, invites: 25, name: 'Free Website Hosting', type: 'method' }
];

// Message milestone rewards — staff verify; $mclaim in tickets
const MESSAGE_REWARDS = [
  { id: 1, messages: 300, name: 'MC Redeem Code Guide', type: 'method' },
  { id: 2, messages: 350, name: '30× Boost Method', type: 'method' },
  { id: 3, messages: 400, name: 'Nitro Method', type: 'method' },
  { id: 4, messages: 450, name: 'Netflix Tips & Tricks', type: 'method' },
  { id: 5, messages: 500, name: 'Legit Xbox Gift Card Giveaway', type: 'method' },
  { id: 6, messages: 550, name: 'CC/VCC Safety & Legit Use Guide', type: 'method' }
];

const METHOD_CATALOG = [
  'MC Redeem Code Method',
  'Nitro Basic Yearly Method',
  'MCFA Email Change Method',
  'MCFA Password Change Method',
  '5,000 Robux Method',
  'Amazon Prime Method',
  'Legit Xbox Gift Card Method',
  '30× Boost Method',
  'Free Website Hosting'
];


function getUserInvites(guildId, userId) {
  return data.invites[guildId]?.[userId] || 0;
}

/** Parse Falcon -i / invites reply → { userId?, count } */
function parseFalconInvites(msg) {
  if (!msg || msg.author?.id !== FALCON_BOT_ID) return null;
  const text = [
    msg.content || '',
    ...(msg.embeds || []).flatMap((e) => [
      e.title || '',
      e.description || '',
      ...(e.fields || []).map((f) => `${f.name} ${f.value}`)
    ])
  ].join('\n');

  // "Name has 5 invites" or "has total of 42 invites"
  let count = null;
  let m =
    text.match(/has\s+total\s+of\s+(\d+)\s+invites/i) ||
    text.match(/has\s+(\d+)\s+invites/i) ||
    text.match(/\*\*[^*]+\s+has\s+(\d+)\s+invites/i) ||
    text.match(/(\d+)\s+invites\s*\|/i);
  if (m) count = parseInt(m[1], 10);
  if (count === null || Number.isNaN(count)) return null;

  // Prefer mentioned user (Falcon often mentions the target)
  let userId =
    msg.mentions?.users?.first()?.id ||
    null;
  // From <@id> in text
  if (!userId) {
    const um = text.match(/<@!?(\d{15,20})>/);
    if (um) userId = um[1];
  }
  return { userId, count, raw: text.slice(0, 200) };
}

function setFalconInvites(guildId, userId, count) {
  if (!guildId || !userId) return;
  if (!data.invites[guildId]) data.invites[guildId] = {};
  data.invites[guildId][userId] = Math.max(0, count);
  if (!data.falconInvites) data.falconInvites = {};
  if (!data.falconInvites[guildId]) data.falconInvites[guildId] = {};
  data.falconInvites[guildId][userId] = {
    count,
    at: new Date().toISOString()
  };
  saveData();
}

function setFalconMessages(guildId, userId, count) {
  if (!guildId || !userId) return;
  if (!data.messages[guildId]) data.messages[guildId] = {};
  // Prefer Falcon count as source of truth when synced
  data.messages[guildId][userId] = Math.max(0, count);
  if (!data.falconMessages) data.falconMessages = {};
  if (!data.falconMessages[guildId]) data.falconMessages[guildId] = {};
  data.falconMessages[guildId][userId] = {
    count,
    at: new Date().toISOString()
  };
  saveData();
}

function parseFalconMessages(msg) {
  if (!msg || msg.author?.id !== FALCON_BOT_ID) return null;
  const text = [
    msg.content || '',
    ...(msg.embeds || []).flatMap((e) => [
      e.title || '',
      e.description || '',
      ...(e.fields || []).map((f) => `${f.name} ${f.value}`)
    ])
  ].join('\n');
  // "has 1234 messages" / "Messages: 1234" / "1,234 messages"
  let m =
    text.match(/has\s+([\d,]+)\s+messages/i) ||
    text.match(/messages?\s*[:=]\s*([\d,]+)/i) ||
    text.match(/([\d,]+)\s+messages/i);
  if (!m) return null;
  const count = parseInt(m[1].replace(/,/g, ''), 10);
  if (Number.isNaN(count)) return null;
  let userId = msg.mentions?.users?.first()?.id || null;
  if (!userId) {
    const um = text.match(/<@!?(\d{15,20})>/);
    if (um) userId = um[1];
  }
  return { userId, count };
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

    // Auto-deliver from stock INTO THE TICKET (not DM)
    const nameL = chosen.name.toLowerCase();
    let productKey = 'mcfa';
    if (nameL.includes('netflix')) productKey = 'netflix';
    else if (nameL.includes('crunchy')) productKey = 'crunchyroll';
    else if (nameL.includes('xbox')) productKey = 'xbox';
    else if (nameL.includes('nitro')) productKey = 'nitro';
    else if (nameL.includes('steam')) productKey = 'steam';
    else if (nameL.includes('donut')) productKey = 'donut';
    else if (nameL.includes('hypixel')) productKey = 'hypixel';
    else if (nameL.includes('method') || nameL.includes('robux') || nameL.includes('guide') || nameL.includes('hosting') || nameL.includes('tips')) {
      // Unlimited method text delivery (does not reduce stock)
      if (!data.methodTexts) data.methodTexts = {};
      const body = data.methodTexts[chosen.name] || data.methodTexts[chosen.name.toLowerCase()];
      if (body) {
        const deliverEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📘 Method delivered')
          .setDescription(
            `**Reward:** ${chosen.name}\n` +
              `**User:** ${user}\n\n` +
              `Method text is unlimited — enjoy.`
          )
          .setFooter({ text: 'Ultimate Rewards • Method claim' })
          .setTimestamp();
        await channel.send({ content: `${user}`, embeds: [deliverEmbed] }).catch(() => {});
        const chunks = [];
        let remaining = String(body);
        while (remaining.length > 0) {
          chunks.push(remaining.slice(0, 1900));
          remaining = remaining.slice(1900);
        }
        for (const c of chunks) {
          await channel.send(c).catch(() => {});
        }
      } else {
        await channel.send(
          `${user} selected **${chosen.name}** (method reward).\n` +
            `Method text is not set yet — staff will complete this. <@&${OWNER_ROLE_ID}>\n` +
            `Staff: set with \`$method set <name> | your method text\``
        ).catch(() => {});
      }
      const pingPayload = await pingOnlineRewardStaff(channel.guild, user, chosen.name);
      if (pingPayload) await channel.send(pingPayload).catch(() => {});
      return;
    }

    const taken = await takeFromStock(productKey, 1);
    if (!taken) {
      await channel.send(
        `${user} selected **${chosen.name}** but **${productKey}** stock is empty.\n` +
          `Staff will assist. <@&${OWNER_ROLE_ID}>`
      ).catch(() => {});
      return;
    }

    const meta = PRODUCT_STOCKS[productKey] || { label: productKey, emoji: '📦' };
    const deliverEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🎁 Reward delivered')
      .setDescription(
        `**Reward:** ${chosen.name}\n` +
          `**Product:** ${meta.emoji} **${meta.label}**\n` +
          `**User:** ${user}\n\n` +
          `# ARE WE LEGIT?\n` +
          `If there is any login issue, reply here and ping staff.`
      )
      .setFooter({ text: 'Ultimate Rewards • Auto claim' })
      .setTimestamp();

    await channel.send({ content: `${user}`, embeds: [deliverEmbed] }).catch(() => {});
    await channel.send(`||${taken[0]}||`).catch(() => {});
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

function parseHitEntry(item) {
  // email:pass  OR  email:pass:MCUsername (username = 3–16 alphanumeric/_)
  if (!item || !item.includes(':')) return null;
  const first = item.indexOf(':');
  const email = item.slice(0, first).trim();
  const rest = item.slice(first + 1).trim();
  if (!email || !rest) return null;
  const last = rest.lastIndexOf(':');
  if (last > 0) {
    const maybe = rest.slice(last + 1).trim();
    if (/^[A-Za-z0-9_]{3,16}$/.test(maybe)) {
      return { email, pass: rest.slice(0, last), username: maybe };
    }
  }
  return { email, pass: rest, username: null };
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


// ========== LEVELING ==========
function xpForLevel(level) {
  // Easier early levels so people see progress quickly
  // L1≈40, L2≈100, L3≈180, L5≈400, L10≈1200
  if (level <= 0) return 0;
  return Math.floor(20 * level * level + 20 * level);
}

function levelFromXp(xp) {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

function getLevelData(guildId, userId) {
  if (!data.levels) data.levels = {};
  if (!data.levels[guildId]) data.levels[guildId] = {};
  if (!data.levels[guildId][userId]) data.levels[guildId][userId] = { xp: 0, level: 0 };
  return data.levels[guildId][userId];
}

function addMessageXp(guildId, userId) {
  if (!global.__levelCd) global.__levelCd = new Map();
  const key = guildId + ':' + userId;
  const now = Date.now();
  const last = global.__levelCd.get(key) || 0;
  if (now - last < LEVEL_COOLDOWN_MS) return null;
  global.__levelCd.set(key, now);

  const row = getLevelData(guildId, userId);
  const gain = LEVEL_XP_MIN + Math.floor(Math.random() * (LEVEL_XP_MAX - LEVEL_XP_MIN + 1));
  row.xp += gain;
  const newLevel = levelFromXp(row.xp);
  const leveled = newLevel > row.level;
  row.level = newLevel;
  saveData();
  return { gain, leveled, level: row.level, xp: row.xp };
}

function buildLevelEmbed(user, member, guildId) {
  const row = getLevelData(guildId, user.id);
  const level = row.level;
  const xp = row.xp;
  const curNeed = xpForLevel(level);
  const nextNeed = xpForLevel(level + 1);
  const into = Math.max(0, xp - curNeed);
  const span = Math.max(1, nextNeed - curNeed);
  const pct = Math.min(100, Math.floor((into / span) * 100));
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  // Rank among guild
  const all = Object.entries(data.levels[guildId] || {})
    .map(([id, v]) => ({ id, xp: v.xp || 0 }))
    .sort((a, b) => b.xp - a.xp);
  const rank = all.findIndex((x) => x.id === user.id) + 1 || all.length;

  const name = member?.displayName || user.username;
  return new EmbedBuilder()
    .setColor(0xfbbf24)
    .setAuthor({ name: `${name}'s level`, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setDescription(
      `**Level ${level}** · Rank **#${rank}**\n` +
        `\`${bar}\` **${pct}%**\n` +
        `XP: **${into.toLocaleString()}** / **${span.toLocaleString()}** to level ${level + 1}\n` +
        `Total XP: **${xp.toLocaleString()}**`
    )
    .setFooter({ text: 'Ultimate Rewards · Leveling' })
    .setTimestamp();
}


async function onReady() {
  console.log(`Logged in as ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    await cacheGuildInvites(guild);
  }
  setInterval(() => saveData(), 60_000);

  try {
    const cmds = [
      new SlashCommandBuilder().setName('gstart').setDescription('Start a giveaway')
        .addStringOption((o) => o.setName('time').setDescription('e.g. 10m, 2h').setRequired(true))
        .addIntegerOption((o) => o.setName('winners').setRequired(true).setMinValue(1).setMaxValue(20))
        .addStringOption((o) => o.setName('prize').setRequired(true)),
      new SlashCommandBuilder().setName('greroll').setDescription('Reroll giveaway')
        .addStringOption((o) => o.setName('message_id').setRequired(false)),
      new SlashCommandBuilder().setName('level').setDescription('Show level card')
        .addUserOption((o) => o.setName('user').setRequired(false)),
      new SlashCommandBuilder().setName('rank').setDescription('Show rank card')
        .addUserOption((o) => o.setName('user').setRequired(false)),
      new SlashCommandBuilder().setName('leaderboard').setDescription('XP leaderboard'),
      new SlashCommandBuilder().setName('stock').setDescription('Current stock status'),
      new SlashCommandBuilder().setName('clear').setDescription('Delete messages')
        .addIntegerOption((o) => o.setName('amount').setRequired(true).setMinValue(1).setMaxValue(100)),
      new SlashCommandBuilder().setName('help').setDescription('Command list'),
      new SlashCommandBuilder().setName('ping').setDescription('Bot latency'),
      new SlashCommandBuilder().setName('avatar').setDescription('User avatar')
        .addUserOption((o) => o.setName('user').setRequired(false)),
      new SlashCommandBuilder().setName('userinfo').setDescription('User info')
        .addUserOption((o) => o.setName('user').setRequired(false)),
      new SlashCommandBuilder().setName('serverinfo').setDescription('Server info'),
      new SlashCommandBuilder().setName('snipe').setDescription('Last deleted message'),
      new SlashCommandBuilder().setName('membercount').setDescription('Member count'),
      new SlashCommandBuilder().setName('uptime').setDescription('Bot uptime'),
      new SlashCommandBuilder().setName('coinflip').setDescription('Heads or tails'),
      new SlashCommandBuilder().setName('poll').setDescription('Create a poll')
        .addStringOption((o) => o.setName('question').setRequired(true)),
      new SlashCommandBuilder().setName('remind').setDescription('Set a reminder')
        .addStringOption((o) => o.setName('time').setDescription('10m, 1h').setRequired(true))
        .addStringOption((o) => o.setName('text').setRequired(true)),
      new SlashCommandBuilder().setName('choose').setDescription('Pick randomly')
        .addStringOption((o) => o.setName('options').setDescription('a | b | c').setRequired(true)),
      new SlashCommandBuilder().setName('claim').setDescription('Claim invite reward (tickets)'),
      new SlashCommandBuilder().setName('staffstats').setDescription('Staff dashboard stats'),
      new SlashCommandBuilder().setName('ultimate').setDescription('Economy balance')
        .addUserOption((o) => o.setName('user').setRequired(false)),
      new SlashCommandBuilder().setName('online').setDescription('Online members in a role')
        .addRoleOption((o) => o.setName('role').setRequired(true)),
      new SlashCommandBuilder().setName('pay').setDescription('Pay 1 MCFA from stock (staff)')
        .addUserOption((o) => o.setName('user').setRequired(true)),
      new SlashCommandBuilder().setName('lock').setDescription('Lock channel (staff)'),
      new SlashCommandBuilder().setName('unlock').setDescription('Unlock channel (staff)'),
      new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode (staff)')
        .addIntegerOption((o) => o.setName('seconds').setRequired(true).setMinValue(0).setMaxValue(21600)),
      new SlashCommandBuilder().setName('say').setDescription('Bot says text (staff)')
        .addStringOption((o) => o.setName('text').setRequired(true)),
      new SlashCommandBuilder().setName('announce').setDescription('Announce embed (staff)')
        .addStringOption((o) => o.setName('text').setRequired(true)),
      new SlashCommandBuilder().setName('addxp').setDescription('Add XP (staff)')
        .addUserOption((o) => o.setName('user').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setRequired(true).setMinValue(1)),
      new SlashCommandBuilder().setName('inv').setDescription('Show invites')
        .addUserOption((o) => o.setName('user').setRequired(false)),
      new SlashCommandBuilder().setName('botinvite').setDescription('Bot invite link'),
      new SlashCommandBuilder().setName('clearstock').setDescription('Clear MCFA stock (staff)')
    ].map((c) => c.toJSON());

    await client.application.commands.set(cmds);
    console.log('Slash commands registered: full set');
  } catch (e) {
    console.error('slash register:', e.message);
  }
  if (data.giveaways) {
    for (const id of Object.keys(data.giveaways)) scheduleGiveaway(id);
  }
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
    return "This is the **Ultimate Rewards** rewards server — rewards, digital products, invite events. Follow staff instructions in tickets. Website: https://ultimate-rewards.onrender.com";
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




async function askOpenAI(userText) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content:
              'You are the Ultimate Rewards staff helper bot on Discord. ' +
              'Be helpful, friendly, short. Website: https://ultimate-rewards.onrender.com. ' +
              'You know MCFA, NFA, SFA, invite rewards, tickets, stock, staff apply. ' +
              'Do NOT help with illegal activity, account theft, credential checking, hacking, or bot-making exploits. ' +
              'If asked who made you: Ultimate Rewards staff + AI assistant.'
          },
          { role: 'user', content: String(userText || '').slice(0, 1500) }
        ]
      })
    });
    if (!res.ok) {
      console.error('OpenAI HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error('OpenAI:', e.message);
    return null;
  }
}

async function deliverProductWithVouch(message, user, productKey, items, skipVouch) {
  const meta = PRODUCT_STOCKS[productKey] || { label: productKey, emoji: '📦' };
  const staff = message.author;
  const list = Array.isArray(items) ? items : [items];

  try {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xbe2c71)
          .setTitle(`Ultimate Rewards — ${meta.label}`)
          .setDescription(
            list.map((it, i) => `**#${i + 1}** ||${it}||`).join('\n') +
              `\n\n# ARE WE LEGIT?\n` +
              `Delivered by **${staff.username}**\n` +
              `If login fails, open a ticket.\n` +
              `${typeof ULTIMATE_WEB !== 'undefined' ? ULTIMATE_WEB : 'https://ultimate-rewards.onrender.com'}`
          )
          .setTimestamp()
      ]
    });
    return true;
  } catch (e) {
    try {
      let dm =
        `**Ultimate Rewards — ${meta.label}**\n` +
        list.map((it, i) => `**#${i + 1}** ||${it}||`).join('\n') +
        `\n\n# ARE WE LEGIT?\nDelivered by ${staff.username}`;
      await user.send(dm);
      return true;
    } catch (_) {
      return false;
    }
  }
}

async function takeFromStock(productKey, amount) {
  ensureStocks(data);
  const arr = data.stocks[productKey] || [];
  if (arr.length < amount) return null;
  const taken = arr.splice(0, amount);
  setStock(productKey, arr);
  saveData();
  return taken;
}



client.on('presenceUpdate', async (before, after) => {
  try {
    if (!after || after.user?.bot || !after.guild) return;
    const role = after.guild.roles.cache.get(FREE_GEN_ROLE_ID);
    if (!role) return;
    const custom = after.activities?.find((a) => a.type === 4);
    const statusText = custom?.state || '';
    const ok = statusText.includes(FREE_STATUS_TEXT);
    const has = after.roles.cache.has(FREE_GEN_ROLE_ID);
    if (ok && !has) await after.roles.add(role).catch(() => {});
    if (!ok && has) await after.roles.remove(role).catch(() => {});
  } catch (_) {}
});


function parseDuration(str) {
  const s = String(str || '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|m|h|d|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const u = (m[2] || 'm').toLowerCase();
  if (u.startsWith('s')) return n * 1000;
  if (u.startsWith('m')) return n * 60 * 1000;
  if (u.startsWith('h')) return n * 60 * 60 * 1000;
  if (u.startsWith('d')) return n * 24 * 60 * 60 * 1000;
  return n * 60 * 1000;
}

function giveawayButtons(joined) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gw_join')
      .setLabel(`JOIN GIVEAWAY (${joined})`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('gw_leave')
      .setLabel('LEAVE GIVEAWAY')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildGiveawayEmbed(gw) {
  const ends = gw.endsAt;
  const ended = Date.now() >= ends;
  return new EmbedBuilder()
    .setColor(ended ? 0xed4245 : 0x5865f2)
    .setTitle(`🎁 | ${gw.prize}`)
    .setDescription(
      `**CLICK THE BUTTON BELOW TO ENTER!**\n\n` +
        `🎉 **WINNERS:** ${gw.winners}\n` +
        `👥 **ENTRIES:** ${gw.entries.length}\n` +
        (ended
          ? `⏰ **ENDED**`
          : `⏰ **ENDS:** <t:${Math.floor(ends / 1000)}:R> (<t:${Math.floor(ends / 1000)}:f>)`) +
        `\n👑 **HOST:** <@${gw.hostId}>`
    )
    .setFooter({ text: ended ? 'Giveaway ended' : 'Ultimate Rewards Giveaway' })
    .setTimestamp(ends);
}

async function endGiveaway(messageId, forceReroll) {
  const gw = data.giveaways?.[messageId];
  if (!gw || (gw.ended && !forceReroll)) return;
  gw.ended = true;
  saveData();
  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  if (!channel) return;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  const pool = [...new Set(gw.entries)];
  const winners = [];
  const copy = [...pool];
  while (winners.length < gw.winners && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    winners.push(copy.splice(i, 1)[0]);
  }
  gw.winnerIds = winners;
  saveData();
  const embed = buildGiveawayEmbed(gw);
  if (msg) {
    await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }
  if (!winners.length) {
    await channel.send(`🎁 Giveaway **${gw.prize}** ended — no valid entries.`).catch(() => {});
    return;
  }
  const mentions = winners.map((id) => `<@${id}>`).join(' ');
  await channel.send(
    `🎉 **CONGRATULATIONS** ${mentions}! You won the **${gw.prize}**!`
  ).catch(() => {});
}

// Schedule ends for active giveaways
function scheduleGiveaway(messageId) {
  const gw = data.giveaways?.[messageId];
  if (!gw || gw.ended) return;
  const delay = Math.max(0, gw.endsAt - Date.now());
  setTimeout(() => endGiveaway(messageId, false), delay);
}



client.on('interactionCreate', async (interaction) => {
  try {
    // Buttons
    if (interaction.isButton()) {
      if (interaction.customId !== 'gw_join' && interaction.customId !== 'gw_leave') return;
      const gw = data.giveaways?.[interaction.message.id];
      if (!gw || gw.ended) {
        return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
      }
      if (!Array.isArray(gw.entries)) gw.entries = [];
      const uid = interaction.user.id;
      if (interaction.customId === 'gw_join') {
        if (gw.entries.includes(uid)) {
          return interaction.reply({ content: 'You already joined!', ephemeral: true });
        }
        gw.entries.push(uid);
        saveData();
        await interaction.message.edit({
          embeds: [buildGiveawayEmbed(gw)],
          components: [giveawayButtons(gw.entries.length)]
        }).catch(() => {});
        return interaction.reply({ content: '✅ You joined the giveaway!', ephemeral: true });
      }
      // leave
      gw.entries = gw.entries.filter((id) => id !== uid);
      saveData();
      await interaction.message.edit({
        embeds: [buildGiveawayEmbed(gw)],
        components: [giveawayButtons(gw.entries.length)]
      }).catch(() => {});
      return interaction.reply({ content: 'You left the giveaway.', ephemeral: true });
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'gstart') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !isStaff(interaction.member)) {
        return interaction.reply({ content: 'Staff only.', ephemeral: true });
      }
      const timeStr = interaction.options.getString('time', true);
      const winners = interaction.options.getInteger('winners', true);
      const prize = interaction.options.getString('prize', true);
      const ms = parseDuration(timeStr);
      if (!ms || ms < 10000) {
        return interaction.reply({
          content: 'Invalid time. Examples: `10m`, `2h`, `1d`',
          ephemeral: true
        });
      }
      const endsAt = Date.now() + ms;
      const gw = {
        prize,
        winners,
        hostId: interaction.user.id,
        channelId: interaction.channelId,
        endsAt,
        entries: [],
        ended: false
      };
      const embed = buildGiveawayEmbed(gw);
      const msg = await interaction.channel.send({
        embeds: [embed],
        components: [giveawayButtons(0)]
      });
      if (!data.giveaways) data.giveaways = {};
      data.giveaways[msg.id] = gw;
      saveData();
      scheduleGiveaway(msg.id);
      return interaction.reply({ content: `Giveaway started: ${msg.url}`, ephemeral: true });
    }

    if (interaction.commandName === 'greroll') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !isStaff(interaction.member)) {
        return interaction.reply({ content: 'Staff only.', ephemeral: true });
      }
      let mid = interaction.options.getString('message_id');
      if (!mid) {
        // last giveaway in this channel
        const list = Object.entries(data.giveaways || {})
          .filter(([, g]) => g.channelId === interaction.channelId)
          .sort((a, b) => (b[1].endsAt || 0) - (a[1].endsAt || 0));
        mid = list[0]?.[0];
      }
      if (!mid || !data.giveaways?.[mid]) {
        return interaction.reply({
          content: 'Giveaway not found. Pass `message_id` of the giveaway message.',
          ephemeral: true
        });
      }
      await endGiveaway(mid, true);
      return interaction.reply({ content: 'Rerolled winners.', ephemeral: true });
    }

    if (interaction.commandName === 'stock') {
      return interaction.reply({ embeds: [buildStockListEmbed(interaction.guild)] });
    }
    if (interaction.commandName === 'clear') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) && !isStaff(interaction.member)) {
        return interaction.reply({ content: 'Staff / Manage Messages only.', ephemeral: true });
      }
      const amount = interaction.options.getInteger('amount', true);
      await interaction.reply({ content: `🧹 Deleting up to **${amount}** messages…`, ephemeral: true });
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        await interaction.followup.send({ content: `Deleted **${deleted.size}** messages.`, ephemeral: true });
      } catch {
        await interaction.followup.send({ content: 'Bulk delete failed (14-day limit?).', ephemeral: true });
      }
      return;
    }
    if (interaction.commandName === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle('Ultimate Rewards — Commands')
        .setDescription(
          'Most features work with **`$`** and **`/`** where registered.\n\n' +
            '**Stock** · `$stock` `/stock`\n' +
            '**Levels** · `$level` `/level` `/rank` `/leaderboard`\n' +
            '**Clear** · `$clear 50` `/clear amount:50`\n' +
            '**Giveaways** · `/gstart` `/greroll`\n' +
            '**Staff** · `$staffstats` `$pay` `$claim` `$help`\n' +
            '**Economy** · `$ultimate` …'
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (interaction.commandName === 'level' || interaction.commandName === 'rank') {
      const target = interaction.options.getUser('user') || interaction.user;
      const member =
        interaction.guild?.members.cache.get(target.id) ||
        (await interaction.guild?.members.fetch(target.id).catch(() => null));
      const embed = buildLevelEmbed(target, member, interaction.guildId);
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'leaderboard') {
      const gid = interaction.guildId;
      const all = Object.entries(data.levels?.[gid] || {})
        .map(([id, v]) => ({ id, xp: v.xp || 0, level: v.level || levelFromXp(v.xp || 0) }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10);
      if (!all.length) {
        return interaction.reply({ content: 'No XP yet — keep chatting!', ephemeral: true });
      }
      const lines = [];
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        let name = e.id;
        try {
          const u = await client.users.fetch(e.id);
          name = u.username;
        } catch (_) {}
        const medal = `**#${i + 1}**`;
        lines.push(`${medal} **${name}** — Lvl ${e.level} · ${e.xp.toLocaleString()} XP`);
      }
      const embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle('XP LEADERBOARD')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Ultimate Rewards · Levels' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ---- shared slash handlers for remaining commands ----
    const name = interaction.commandName;
    const guild = interaction.guild;
    const user = interaction.user;
    const member = interaction.member;

    if (name === 'ping') {
      const t = Date.now();
      await interaction.reply({ content: 'Pinging…', ephemeral: true });
      return interaction.editReply(`Pong · \`${Date.now() - t}ms\` · WS \`${Math.round(client.ws.ping)}ms\``);
    }
    if (name === 'avatar') {
      const u = interaction.options.getUser('user') || user;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`${u.username}`).setImage(u.displayAvatarURL({ size: 4096 }))]
      });
    }
    if (name === 'userinfo') {
      const u = interaction.options.getUser('user') || user;
      const m = guild?.members.cache.get(u.id) || (await guild?.members.fetch(u.id).catch(() => null));
      const row = getLevelData(guild.id, u.id);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setAuthor({ name: u.tag, iconURL: u.displayAvatarURL() })
            .setThumbnail(u.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: 'ID', value: u.id, inline: true },
              { name: 'Level', value: `${row.level} (${row.xp} XP)`, inline: true },
              { name: 'Joined', value: m?.joinedAt ? `<t:${Math.floor(m.joinedAt.getTime()/1000)}:R>` : '—', inline: true }
            )
        ]
      });
    }
    if (name === 'serverinfo') {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfbbf24)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
              { name: 'Members', value: `${guild.memberCount}`, inline: true },
              { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
              { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true }
            )
        ]
      });
    }
    if (name === 'snipe') {
      const s = global.__snipes?.get(interaction.channelId);
      if (!s) return interaction.reply({ content: 'Nothing to snipe.', ephemeral: true });
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setAuthor({ name: s.author, iconURL: s.avatar })
            .setDescription(s.content || '*empty*')
            .setTimestamp(s.at)
        ]
      });
    }
    if (name === 'membercount') {
      return interaction.reply(`**${guild.name}** has **${guild.memberCount}** members.`);
    }
    if (name === 'uptime') {
      const s = Math.floor(process.uptime());
      return interaction.reply(`Uptime: **${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s**`);
    }
    if (name === 'coinflip') {
      return interaction.reply(`**${Math.random() < 0.5 ? 'Heads' : 'Tails'}**`);
    }
    if (name === 'poll') {
      const q = interaction.options.getString('question', true);
      const msg = await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('POLL').setDescription(q)],
        fetchReply: true
      });
      await msg.react('⬆️').catch(() => {});
      await msg.react('⬇️').catch(() => {});
      return;
    }
    if (name === 'remind') {
      const timeStr = interaction.options.getString('time', true);
      const note = interaction.options.getString('text', true);
      const ms = parseDuration(timeStr);
      if (!ms) return interaction.reply({ content: 'Invalid time.', ephemeral: true });
      await interaction.reply({ content: `Reminder set <t:${Math.floor((Date.now()+ms)/1000)}:R>`, ephemeral: true });
      setTimeout(() => {
        interaction.channel.send(`${user} **Reminder:** ${note}`).catch(() => {});
      }, ms);
      return;
    }
    if (name === 'choose') {
      const parts = interaction.options.getString('options', true).split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) return interaction.reply({ content: 'Use: a | b | c', ephemeral: true });
      return interaction.reply(`I pick: **${parts[Math.floor(Math.random() * parts.length)]}**`);
    }
    if (name === 'claim') {
      if (!isTicketChannel(interaction.channel)) {
        return interaction.reply({ content: '`/claim` only works inside tickets.', ephemeral: true });
      }
      await interaction.reply({ content: 'Opening claim menu…', ephemeral: true });
      await startRewardClaimFlow(interaction.channel, user);
      return;
    }
    if (name === 'ultimate') {
      const u = interaction.options.getUser('user') || user;
      const coins = data.coins?.[u.id] || 0;
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfbbf24)
            .setTitle('Ultimate balance')
            .setDescription(`**${u.username}** has **${coins}** coins`)
        ]
      });
    }
    if (name === 'online') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      const role = interaction.options.getRole('role', true);
      await guild.members.fetch().catch(() => {});
      const online = guild.members.cache.filter(
        (m) => !m.user.bot && m.roles.cache.has(role.id) && m.presence && ['online','idle','dnd'].includes(m.presence.status)
      );
      const names = [...online.values()].slice(0, 30).map((m) => m.displayName).join('\n') || 'None online';
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setTitle(`Online · ${role.name}`).setDescription(names)]
      });
    }
    if (name === 'pay') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      const target = interaction.options.getUser('user', true);
      ensureStocks(data);
      const stock = getStock('mcfa');
      if (!stock.length) return interaction.reply({ content: 'MCFA stock empty.', ephemeral: true });
      const item = stock.shift();
      data.mcfaStock = data.stocks.mcfa;
      saveData();
      try {
        await target.send(`Your reward:\n||${item}||`);
        return interaction.reply({ content: `Paid **1 MCFA** to **${target.username}** (DM).`, ephemeral: true });
      } catch {
        stock.unshift(item);
        saveData();
        return interaction.reply({ content: 'Could not DM user — stock restored.', ephemeral: true });
      }
    }
    if (name === 'lock') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
      return interaction.reply('Channel locked.');
    }
    if (name === 'unlock') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {});
      return interaction.reply('Channel unlocked.');
    }
    if (name === 'slowmode') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      const sec = interaction.options.getInteger('seconds', true);
      await interaction.channel.setRateLimitPerUser(sec).catch(() => {});
      return interaction.reply(sec ? `Slowmode **${sec}s**` : 'Slowmode off.');
    }
    if (name === 'say') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      await interaction.reply({ content: 'Sent.', ephemeral: true });
      return interaction.channel.send(interaction.options.getString('text', true));
    }
    if (name === 'announce') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      await interaction.reply({ content: 'Sent.', ephemeral: true });
      return interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfbbf24)
            .setTitle('Announcement')
            .setDescription(interaction.options.getString('text', true))
            .setFooter({ text: `By ${user.username}` })
        ]
      });
    }
    if (name === 'addxp') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const row = getLevelData(guild.id, target.id);
      row.xp += amount;
      row.level = levelFromXp(row.xp);
      saveData();
      return interaction.reply(`Added **${amount}** XP to **${target.username}** → Level **${row.level}**`);
    }
    if (name === 'inv') {
      const u = interaction.options.getUser('user') || user;
      const count = getUserInvites(guild.id, u.id);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Invites')
            .setDescription(`**${u.username}** · **${count}** invites`)
        ]
      });
    }
    if (name === 'botinvite') {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
      return interaction.reply({ content: url, ephemeral: true });
    }
    if (name === 'clearstock') {
      if (!isStaff(member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
      ensureStocks(data);
      const n = (data.stocks.mcfa || []).length;
      data.stocks.mcfa = [];
      data.mcfaStock = [];
      saveData();
      return interaction.reply(`Cleared **${n}** MCFA stock.`);
    }
    if (name === 'staffstats') {
      // defer to prefix-style by telling user to use $staffstats if complex
      await interaction.reply({ content: 'Use `$staffstats` for the full staff panel (same data).', ephemeral: true });
      return;
    }
  } catch (e) {
    console.error('interaction:', e.message);
    if (interaction.isRepliable() && !interaction.replied) {
      interaction.reply({ content: 'Error handling interaction.', ephemeral: true }).catch(() => {});
    }
  }
});



client.on('messageDelete', (message) => {
  try {
    if (!message.guild || message.author?.bot) return;
    if (!global.__snipes) global.__snipes = new Map();
    global.__snipes.set(message.channel.id, {
      content: message.content || '',
      author: message.author?.tag || 'Unknown',
      avatar: message.author?.displayAvatarURL?.() || undefined,
      at: Date.now()
    });
  } catch (_) {}
});

client.on('messageCreate', async (message) => {
  if (!message.guild) return;

  // Level XP for real users (not bots) — any chat, not only long messages
  if (!message.author.bot) {
    const isCmd = message.content && message.content.startsWith(PREFIX);
    // Still grant XP for normal chat; skip pure command lines
    if (!isCmd) {
      try {
        const res = addMessageXp(message.guild.id, message.author.id);
        if (res && res.gain) {
          // silent gain; only announce level-ups
        }
        if (res?.leveled) {
          const gg = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('LEVEL UP — GG')
            .setDescription(
              `${message.author} reached **Level ${res.level}**!\n` +
                `Use \`/level\` or \`$level\` to see your card.`
            )
            .setThumbnail(message.author.displayAvatarURL({ size: 128 }));
          message.channel.send({ embeds: [gg] }).catch(() => {});
        }
      } catch (e) {
        console.error('level xp:', e.message);
      }
    }
  }

  // ========== Falcon -i invite sync ==========
  if (message.author.bot && message.author.id === FALCON_BOT_ID) {
    try {
      const resolveUid = async (parsed) => {
        let uid = parsed?.userId || null;
        if (!uid && message.reference?.messageId) {
          const ref = await message.channel.messages
            .fetch(message.reference.messageId)
            .catch(() => null);
          if (ref) {
            uid = ref.mentions?.users?.first()?.id || ref.author?.id || null;
          }
        }
        return uid;
      };

      const inv = parseFalconInvites(message);
      if (inv && inv.count !== null) {
        const uid = await resolveUid(inv);
        if (uid) {
          setFalconInvites(message.guild.id, uid, inv.count);
          console.log(`Falcon invites: ${uid} → ${inv.count}`);
        }
      }

      const msgs = parseFalconMessages(message);
      if (msgs && msgs.count !== null) {
        const uid = await resolveUid(msgs);
        if (uid) {
          setFalconMessages(message.guild.id, uid, msgs.count);
          console.log(`Falcon messages: ${uid} → ${msgs.count}`);
        }
      }
    } catch (e) {
      console.error('Falcon parse:', e.message);
    }
    return;
  }

  if (message.author.bot) return;

  addMessage(message.guild.id, message.author.id);

  // ========== LEGIT REACTION ==========
  // If message contains the word "legit" → react with ✅
  try {
    if (/\blegit\b/i.test(message.content)) {
      await message.react('✅').catch(() => {});
    }
  } catch (_) {}


  // ========== @Bot FAQ AI (only direct @bot — not @everyone / @roles) ==========
  try {
    if (
      client.user &&
      !message.author.bot &&
      message.mentions.users.has(client.user.id) &&
      !message.mentions.everyone &&
      (!data.aiChannelId || String(message.channel.id) === String(data.aiChannelId))
    ) {
      // Ignore pure role mass-pings that also happen to list the bot somehow
      const cleaned = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .replace(/<@&\d+>/g, '')
        .replace(/@everyone/gi, '')
        .replace(/@here/gi, '')
        .trim();
      // If after stripping mentions there's nothing useful and they only mass-pinged, skip
      if (!cleaned && (message.mentions.roles.size > 0 || message.content.includes('@everyone'))) {
        // still allow empty → help only when bot was intentionally pinged alone-ish
      }
      let reply = await askOpenAI(cleaned || 'help');
      if (!reply) reply = ultimateFaqReply(cleaned || 'help');
      await message.reply(reply.slice(0, 1900)).catch(() => {});
    }
  } catch (e) {
    console.error('faq:', e.message);
  }

  // ========== Vouch channel auto-thanks ==========
  try {
    if (
      VOUCH_CHANNEL_ID &&
      String(message.channel.id) === String(VOUCH_CHANNEL_ID) &&
      !message.author.bot &&
      /\b(got|vouch|legit)\b/i.test(message.content)
    ) {
      await message.reply('***Thanks for vouching ❤️***').catch(() => {});
    }
  } catch (_) {}


  // ========== ANTI MASS-PING ==========
  // If the same user is mentioned 3+ times quickly by one person → 3 day timeout
  try {
    if (data.protection?.antinuke !== false && message.mentions.users.size > 0 && message.member && message.guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
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

  
  // AUTOMOD_BADWORDS_HOOK
  if (
    data.protection?.automod &&
    !message.author.bot &&
    message.member &&
    !isCoOwnerOrAbove(message.member)
  ) {
    const words = String(data.protection.badWords || '')
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const content = (message.content || '').toLowerCase();
    if (words.some((w) => w && content.includes(w))) {
      await message.delete().catch(() => {});
      await message.channel
        .send(`${message.author} watch your language.`)
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
        .catch(() => {});
      return;
    }
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
      const medal = `**#${i + 1}**`;
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
  if (cmd === 'stock') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const sub = (args[0] || '').toLowerCase();
    if (!sub || sub === 'list' || sub === 'status') {
      return message.reply({ embeds: [buildStockListEmbed(message.guild)] });
    }
    return message.reply('`$stock list` — show all product stock counts');
  }

  // Generic product stock: $mcfa / $crunchyroll / $xbox / $netflix / $hypixel / $donut / $nitro / $steam
  if (resolveProductKey(cmd) && cmd !== 'custom') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const productKey = resolveProductKey(cmd);
    const meta = PRODUCT_STOCKS[productKey];
    const sub = (args[0] || '').toLowerCase();
    ensureStocks(data);

    if (!sub || sub === 'count' || sub === 'left') {
      return message.reply(
        `**${meta.label}** stock: **${getStock(productKey).length}**`
      );
    }
    if (sub === 'list' || sub === 'paste') {
      const stock = getStock(productKey);
      if (!stock.length) return message.reply(`No **${meta.label}** stock.`);
      const spoilers = stock.map((a) => `||${a}||`);
      const chunks = [];
      let buf = `**${meta.label} stock (${stock.length})**\n`;
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
      const accounts = parseAccounts(rest).length
        ? parseAccounts(rest)
        : rest.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      if (!accounts.length) {
        return message.reply(`Usage: \`$${cmd} add <item>\` (multiple OK)`);
      }
      let added = 0;
      const arr = getStock(productKey);
      for (const a of accounts) {
        if (!arr.includes(a)) {
          arr.push(a);
          added++;
        }
      }
      setStock(productKey, arr);
      saveData();
      return message.reply(
        `Added **${added}** to **${meta.label}** · Stock now **${arr.length}**`
      );
    }
    if (sub === 'clear') {
      const n = getStock(productKey).length;
      setStock(productKey, []);
      saveData();
      return message.reply(`Cleared **${n}** from **${meta.label}**.`);
    }
    if (sub === 'export') {
      return exportStockToChannel(
        message,
        productKey,
        getStock(productKey),
        meta.label
      );
    }
    return message.reply(
      `**${meta.label}**\n\`$${cmd}\` · \`$${cmd} list\` · \`$${cmd} add\` · \`$${cmd} clear\` · \`$${cmd} export #ch\``
    );
  }

  if (cmd === 'mcfa_legacy_disabled_placeholder') {
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

  // ========== $pay @user [product] [amount] ==========
  // $pay @user → 1 mcfa
  // $pay @user 5 → 5 mcfa
  // $pay @user netflix 2 → 2 netflix
  // $crunchyroll @user 1 also works via product cmds below
  if (cmd === 'pay') {
    if (!isStaff(message.member)) return message.reply('Staff only.');

    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));

    if (!user || user.bot) {
      return message.reply(
        'Usage: `$pay @user` · `$pay @user 5` · `$pay @user netflix 2`\n' +
          'Products: mcfa, donut, hypixel, nitro, netflix, steam, crunchyroll, xbox, custom'
      );
    }

    let productKey = 'mcfa';
    let amount = 1;
    for (const a of args) {
      if (/^\d+$/.test(a)) {
        amount = Math.min(50, Math.max(1, parseInt(a, 10)));
        continue;
      }
      const pk = resolveProductKey(a);
      if (pk) productKey = pk;
    }

    const meta = PRODUCT_STOCKS[productKey];
    const taken = await takeFromStock(productKey, amount);
    if (!taken) {
      return message.reply(
        `Not enough **${meta.label}**. Need **${amount}**, have **${getStock(productKey).length}**.`
      );
    }

    const ok = await deliverProductWithVouch(message, user, productKey, taken, false);
    if (!ok) {
      // restore
      const arr = getStock(productKey);
      arr.unshift(...taken);
      setStock(productKey, arr);
      saveData();
      return message.reply(`Could not DM ${user}. Stock restored.`);
    }
    return message.reply(
      `Paid **${taken.length}× ${meta.emoji} ${meta.label}** to ${user} · left **${getStock(productKey).length}** · waiting **yes/no** in DM`
    );
  }

  // ========== $salary @user [amount] ==========
  // Only usable by user ID 1398979148063571989 or members with role 1547183159794204675
  if (cmd === 'salary') {
    // $salary add — owners only, locked channel
    if ((args[0] || '').toLowerCase() === 'add') {
      const allowed =
        message.author.id === (data.birthdayUserId || BIRTHDAY_USER_ID) || isCoOwnerOrAbove(message.member);
      if (!allowed) return message.reply('Owners only.');
      if (String(message.channel.id) !== String(SALARY_ADD_CHANNEL_ID)) {
        return message.reply(`Use this only in <#${SALARY_ADD_CHANNEL_ID}>.`);
      }
      const rest = body.slice(body.toLowerCase().indexOf('add') + 3).trim();
      if (!rest) return message.reply('Usage: `$salary add email:pass`');
      const items = parseAccounts(rest).length
        ? parseAccounts(rest)
        : rest.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      ensureStocks(data);
      const arr = getStock('mcfa');
      for (const it of items) {
        if (!arr.includes(it)) arr.push(it);
      }
      setStock('mcfa', arr);
      saveData();
      const reply = await message.reply(
        `Added **${items.length}** salary reward(s) · pool **${arr.length}**`
      );
      setTimeout(() => {
        message.delete().catch(() => {});
        reply.delete().catch(() => {});
      }, 3000);
      return;
    }

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

  // ========== $clear [amount] — delete channel messages ==========
  if (cmd === 'clear' || cmd === 'purge') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages) && !isStaff(message.member)) {
      return message.reply('Need **Manage Messages**.');
    }
    const amount = Math.min(100, Math.max(1, parseInt(args[0], 10) || 0));
    if (!amount) {
      return message.reply('Usage: `$clear <1-100>` — deletes that many messages.\n`$clearstock` — clears MCFA stock.');
    }
    try {
      const deleted = await message.channel.bulkDelete(amount + 1, true); // +1 includes command
      const note = await message.channel.send(`🧹 Deleted **${Math.max(0, deleted.size - 1)}** messages.`);
      setTimeout(() => note.delete().catch(() => {}), 4000);
    } catch (e) {
      return message.reply('Could not bulk delete (messages may be older than 14 days).');
    }
    return;
  }

  if (cmd === 'clearstock') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    ensureStocks(data);
    const n = (data.stocks.mcfa || data.mcfaStock || []).length;
    data.mcfaStock = [];
    if (data.stocks) data.stocks.mcfa = [];
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
  if (cmd === 'ultimate' || cmd === 'cozy' || cmd === 'ultimate' || cmd === 'economy') {
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
        const medal = `**#${i + 1}**`;
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



  // ========== $method (unlimited method text library) ==========
  // $method list
  // $method set <Exact Reward Name> | <method body>
  // $method get <Exact Reward Name>
  // $method del <Exact Reward Name>
  if (cmd === 'method') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    if (!data.methodTexts) data.methodTexts = {};

    const sub = (args[0] || '').toLowerCase();
    if (!sub || sub === 'list') {
      const keys = Object.keys(data.methodTexts);
      if (!keys.length) {
        return message.reply(
          'No method texts saved yet.\n' +
            'Add with:\n`$method set MC Redeem Code Method | your full method text here`'
        );
      }
      return message.reply(
        '**Saved methods (unlimited):**\n' + keys.map((k) => `• **${k}**`).join('\n')
      );
    }

    if (sub === 'get') {
      const name = body.slice(body.toLowerCase().indexOf('get') + 3).trim();
      if (!name) return message.reply('Usage: `$method get <Exact Reward Name>`');
      const t = data.methodTexts[name] || data.methodTexts[name.toLowerCase()];
      if (!t) return message.reply(`No method text for **${name}**.`);
      const chunks = [];
      let rem = String(t);
      while (rem.length) {
        chunks.push(rem.slice(0, 1900));
        rem = rem.slice(1900);
      }
      for (const c of chunks) await message.channel.send(c);
      return;
    }

    if (sub === 'del' || sub === 'delete' || sub === 'remove') {
      const name = body.slice(body.toLowerCase().indexOf(sub) + sub.length).trim();
      if (!name) return message.reply('Usage: `$method del <Exact Reward Name>`');
      if (data.methodTexts[name]) {
        delete data.methodTexts[name];
        saveData();
        return message.reply(`Deleted method text for **${name}**.`);
      }
      return message.reply(`No method text named **${name}**.`);
    }

    if (sub === 'set' || sub === 'add') {
      const rest = body.slice(body.toLowerCase().indexOf(sub) + sub.length).trim();
      const sep = rest.indexOf('|');
      if (sep < 1) {
        return message.reply(
          'Usage:\n`$method set MC Redeem Code Method | full method text here`\n' +
            'Name must match the reward name exactly (see `$claim` list).'
        );
      }
      const name = rest.slice(0, sep).trim();
      const content = rest.slice(sep + 1).trim();
      if (!name || !content) {
        return message.reply('Need both a name and text after `|`.');
      }
      data.methodTexts[name] = content;
      saveData();
      return message.reply(
        `Saved method text for **${name}** (${content.length} chars).\n` +
          `This is **unlimited** — claims never reduce stock.`
      );
    }

    return message.reply(
      '`$method list` — saved methods\n' +
        '`$method set <name> | <text>` — save/update\n' +
        '`$method get <name>` — preview\n' +
        '`$method del <name>` — delete'
    );
  }

  // ========== $claim ==========
  // In a ticket: show eligible rewards based on invites, then ping online staff
  if (cmd === 'claim') {
    if (!isTicketChannel(message.channel)) {
      return message.reply('`$claim` only works **inside tickets**.');
    }
    await startRewardClaimFlow(message.channel, message.author);
    return;
  }

  // ========== $level / $rank / $leaderboard ==========
  if (cmd === 'level' || cmd === 'rank') {
    let target = message.mentions.users.first() || message.author;
    if (!message.mentions.users.first() && args[0]) {
      target = await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => message.author);
    }
    const member =
      message.guild.members.cache.get(target.id) ||
      (await message.guild.members.fetch(target.id).catch(() => null));
    return message.reply({ embeds: [buildLevelEmbed(target, member, message.guild.id)] });
  }
  if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'levels') {
    const gid = message.guild.id;
    const all = Object.entries(data.levels?.[gid] || {})
      .map(([id, v]) => ({ id, xp: v.xp || 0, level: v.level || levelFromXp(v.xp || 0) }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10);
    if (!all.length) return message.reply('No XP yet — keep chatting!');
    const lines = [];
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      let name = e.id;
      try {
        name = (await client.users.fetch(e.id)).username;
      } catch (_) {}
      const medal = `**#${i + 1}**`;
      lines.push(`${medal} **${name}** — Lvl ${e.level} · ${e.xp.toLocaleString()} XP`);
    }
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfbbf24)
          .setTitle('XP LEADERBOARD')
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Ultimate Rewards · Levels' })
      ]
    });
  }


  // ========== $addxp @user amount (staff) ==========
  if (cmd === 'addxp') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const target = message.mentions.users.first();
    const amount = parseInt(args.find((a) => /^\d+$/.test(a)), 10);
    if (!target || !amount) return message.reply('Usage: `$addxp @user 100`');
    const row = getLevelData(message.guild.id, target.id);
    row.xp += amount;
    row.level = levelFromXp(row.xp);
    saveData();
    return message.reply(
      `Added **${amount}** XP to **${target.username}** → Level **${row.level}** (${row.xp} XP)`
    );
  }

  // ========== $ping ==========
  if (cmd === 'ping') {
    const sent = await message.reply('Pinging…');
    const lat = sent.createdTimestamp - message.createdTimestamp;
    return sent.edit(`🏓 **Pong** · Message \`${lat}ms\` · WS \`${Math.round(client.ws.ping)}ms\``);
  }

  // ========== $avatar ==========
  if (cmd === 'avatar' || cmd === 'av' || cmd === 'pfp') {
    const u = message.mentions.users.first() || message.author;
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`${u.username}'s avatar`)
          .setImage(u.displayAvatarURL({ size: 4096 }))
      ]
    });
  }

  // ========== $userinfo / $serverinfo ==========
  if (cmd === 'userinfo' || cmd === 'whois' || cmd === 'ui') {
    const u = message.mentions.users.first() || message.author;
    const m =
      message.guild.members.cache.get(u.id) ||
      (await message.guild.members.fetch(u.id).catch(() => null));
    const roles = m
      ? m.roles.cache
          .filter((r) => r.id !== message.guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => r.name)
          .slice(0, 15)
          .join(', ') || '—'
      : '—';
    const row = getLevelData(message.guild.id, u.id);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setAuthor({ name: u.tag, iconURL: u.displayAvatarURL() })
          .setThumbnail(u.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: 'ID', value: u.id, inline: true },
            { name: 'Level', value: `${row.level} (${row.xp} XP)`, inline: true },
            { name: 'Joined', value: m?.joinedAt ? `<t:${Math.floor(m.joinedAt.getTime()/1000)}:R>` : '—', inline: true },
            { name: 'Created', value: `<t:${Math.floor(u.createdTimestamp/1000)}:R>`, inline: true },
            { name: 'Roles', value: roles.slice(0, 1024) }
          )
      ]
    });
  }

  if (cmd === 'serverinfo' || cmd === 'si') {
    const g = message.guild;
    await g.members.fetch().catch(() => {});
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfbbf24)
          .setTitle(g.name)
          .setThumbnail(g.iconURL({ size: 256 }))
          .addFields(
            { name: 'Members', value: `${g.memberCount}`, inline: true },
            { name: 'Channels', value: `${g.channels.cache.size}`, inline: true },
            { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
            { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
            { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp/1000)}:R>`, inline: true },
            { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (lvl ${g.premiumTier})`, inline: true }
          )
      ]
    });
  }

  // ========== $snipe (last deleted message) ==========
  if (cmd === 'snipe') {
    const s = global.__snipes?.get(message.channel.id);
    if (!s) return message.reply('Nothing to snipe in this channel.');
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setAuthor({ name: s.author, iconURL: s.avatar })
          .setDescription(s.content || '*empty*')
          .setFooter({ text: 'Deleted message' })
          .setTimestamp(s.at)
      ]
    });
  }

  // ========== $say ==========
  if (cmd === 'say') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const t = args.join(' ');
    if (!t) return message.reply('Usage: `$say text`');
    await message.delete().catch(() => {});
    return message.channel.send(t);
  }

  // ========== $announce ==========
  if (cmd === 'announce') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const t = args.join(' ');
    if (!t) return message.reply('Usage: `$announce text`');
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfbbf24)
          .setTitle('📢 Announcement')
          .setDescription(t)
          .setFooter({ text: `By ${message.author.username}` })
          .setTimestamp()
      ]
    });
  }

  // ========== $membercount ==========
  if (cmd === 'membercount' || cmd === 'mc') {
    return message.reply(`👥 **${message.guild.name}** has **${message.guild.memberCount}** members.`);
  }


  // ========== $poll ==========
  if (cmd === 'poll') {
    const q = args.join(' ');
    if (!q) return message.reply('Usage: `$poll Your question?`');
    const m = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('POLL')
          .setDescription(q)
          .setFooter({ text: `By ${message.author.username}` })
      ]
    });
    await m.react('⬆️').catch(() => {});
    await m.react('⬇️').catch(() => {});
    return;
  }

  // ========== $remind ==========
  if (cmd === 'remind' || cmd === 'reminder') {
    const timeStr = args[0];
    const note = args.slice(1).join(' ');
    const ms = typeof parseDuration === 'function' ? parseDuration(timeStr) : null;
    if (!ms || !note) return message.reply('Usage: `$remind 10m do homework`');
    await message.reply(`OK — I will remind you <t:${Math.floor((Date.now()+ms)/1000)}:R>.`);
    setTimeout(() => {
      message.channel.send(`${message.author} **Reminder:** ${note}`).catch(() => {});
    }, ms);
    return;
  }

  // ========== $coinflip / $cf (quick) ==========
  if (cmd === 'coinflip' || cmd === 'coin') {
    const r = Math.random() < 0.5 ? 'Heads' : 'Tails';
    return message.reply(`**${r}**`);
  }

  // ========== $choose ==========
  if (cmd === 'choose' || cmd === 'pick') {
    const parts = body.split(/\s+/).slice(1).join(' ').split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return message.reply('Usage: `$choose a | b | c`');
    return message.reply(`I pick: **${parts[Math.floor(Math.random() * parts.length)]}**`);
  }

  // ========== $uptime ==========
  if (cmd === 'uptime') {
    const s = Math.floor(process.uptime());
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return message.reply(`Uptime: **${h}h ${m}m ${sec}s**`);
  }

  // ========== $invite (bot invite) ==========
  if (cmd === 'botinvite' || cmd === 'invitebot') {
    const id = client.user.id;
    const url = `https://discord.com/api/oauth2/authorize?client_id=${id}&permissions=8&scope=bot%20applications.commands`;
    return message.reply(`Bot invite:\n${url}`);
  }

  // ========== $setnick ==========
  if (cmd === 'setnick' || cmd === 'nick') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const u = message.mentions.members.first();
    const nick = args.slice(1).join(' ') || null;
    if (!u) return message.reply('Usage: `$setnick @user new nick`');
    try {
      await u.setNickname(nick);
      return message.reply(`Nickname updated for **${u.user.username}**.`);
    } catch {
      return message.reply('Could not change nickname (role hierarchy / permissions).');
    }
  }

  // ========== $slowmode ==========
  if (cmd === 'slowmode') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const sec = Math.min(21600, Math.max(0, parseInt(args[0], 10) || 0));
    try {
      await message.channel.setRateLimitPerUser(sec);
      return message.reply(sec ? `Slowmode set to **${sec}s**.` : 'Slowmode off.');
    } catch {
      return message.reply('Failed to set slowmode.');
    }
  }

  // ========== $lock / $unlock ==========
  if (cmd === 'lock') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.reply('Channel locked.');
    } catch {
      return message.reply('Failed to lock.');
    }
  }
  if (cmd === 'unlock') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
      return message.reply('Channel unlocked.');
    } catch {
      return message.reply('Failed to unlock.');
    }
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
    ].filter((r) => r.id);

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
    const ign = hit.username || null;
    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setAuthor({ name: 'Ultimate Rewards • Hit' })
      .addFields(
        { name: '📧 Email', value: `||${hit.email}||`, inline: false },
        { name: '🔑 Password', value: `||${hit.pass}||`, inline: false },
        {
          name: '🧑 IGN',
          value: ign ? `**${ign}**` : '_not set — add as email:pass:Username_',
          inline: false
        },
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

    // Public skin (no login) via mc-heads
    if (ign) {
      embed.setThumbnail(
        `https://mc-heads.net/avatar/${encodeURIComponent(ign)}/128`
      );
      embed.setImage(
        `https://mc-heads.net/body/${encodeURIComponent(ign)}/120`
      );
    }
    return embed;
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
            '`$hit add hypixel email:pass:Username`\n' +
            '`$hit add donut email:pass:Username`\n' +
            '`$hit add both email:pass` (username optional for skin)'
        );
      }
      const rest = body.slice(body.toLowerCase().indexOf(kind) + kind.length).trim();
      const rawItems = rest
        .replace(/\|\|/g, ' ')
        .replace(/,/g, '\n')
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const entries = [];
      for (const item of rawItems) {
        const e = parseHitEntry(item);
        if (e) entries.push(e);
      }
      if (!entries.length) {
        return message.reply(
          'No entries found.\n' +
            'Format: `email:pass` or `email:pass:MCUsername`\n' +
            'Example: `$hit add hypixel a@b.com:Secret1:Steve`'
        );
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
      for (const e of entries) {
        data.hits.push({
          email: e.email,
          pass: e.pass,
          username: e.username || null,
          type: 'MCFA',
          hypixel: hyp,
          donut: don,
          uploadedAt: new Date().toISOString(),
          by: message.author.id
        });
      }
      const withName = entries.filter((e) => e.username).length;
      saveData();
      return message.reply(
        `Added **${entries.length}** hit(s) (**${withName}** with IGN/skin) · Hypixel: **${hyp}** · Donut: **${don}** · Queue: **${data.hits.length}**`
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

      ensureStocks(data);
      const available = Object.keys(PRODUCT_STOCKS).filter((k) => getStock(k).length > 0);
      if (!available.length) {
        return message.reply('No stock left in any product for daily pay.');
      }
      // Prefer custom if present (65%), else random among available
      let pool;
      if (available.includes('custom') && Math.random() < 0.65) {
        pool = 'custom';
      } else {
        pool = available[Math.floor(Math.random() * available.length)];
      }

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

      const taken = await takeFromStock(pool, 1);
      if (!taken) {
        return message.reply('Stock changed during spin — try again.');
      }
      const rewardText = taken[0];
      const meta = PRODUCT_STOCKS[pool];

      const resultEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎉 Daily Spin Result')
        .setDescription(
          `${user} won **${meta.emoji} ${meta.label}**!\n\n` +
            `Reward sent to **DMs** (yes/no confirm).\n` +
            `Left in that stock: **${getStock(pool).length}**`
        )
        .setFooter({ text: `Spun by ${message.author.username}` })
        .setTimestamp();

      await spinMsg.edit({ embeds: [resultEmbed] }).catch(() =>
        message.channel.send({ embeds: [resultEmbed] })
      );

      const ok = await deliverProductWithVouch(message, user, pool, taken, false);
      if (!ok) {
        const arr = getStock(pool);
        arr.unshift(rewardText);
        setStock(pool, arr);
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



  // ========== $birthday gift send @user (owner only) ==========
  if (cmd === 'birthday') {
    if (message.author.id !== (data.birthdayUserId || BIRTHDAY_USER_ID)) {
      return message.reply('Only the designated owner can use birthday gifts.');
    }
    const sub = (args[0] || '').toLowerCase();
    if (sub !== 'gift') {
      return message.reply('Usage: `$birthday gift @user` or `$birthday gift send @user`');
    }
    const user =
      message.mentions.users.first() ||
      (args[1] && args[1].toLowerCase() === 'send'
        ? message.mentions.users.first()
        : null) ||
      (args[2] && (await client.users.fetch(args[2].replace(/[<@!>]/g, '')).catch(() => null))) ||
      (args[1] && (await client.users.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null)));

    if (!user || user.bot) {
      return message.reply('Usage: `$birthday gift @user`');
    }

    // Prefer custom, else any available stock
    ensureStocks(data);
    let key = getStock('custom').length ? 'custom' : null;
    if (!key) {
      const avail = Object.keys(PRODUCT_STOCKS).filter((k) => getStock(k).length);
      key = avail[0] || null;
    }
    if (!key) return message.reply('No stock available for a birthday gift.');
    const taken = await takeFromStock(key, 1);
    const ok = await deliverProductWithVouch(message, user, key, taken, true);
    if (!ok) {
      getStock(key).unshift(taken[0]);
      setStock(key, getStock(key));
      saveData();
      return message.reply('Could not DM them — gift restored to stock.');
    }
    return message.reply(
      `🎂 Birthday gift (**${PRODUCT_STOCKS[key].label}**) sent to ${user}!`
    );
  }

  // ========== $staff apply / OPEN / CLOSED ==========
  if (cmd === 'staff') {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'apply') {
      const mode = (args[1] || '').toLowerCase();

      if (mode === 'closed') {
        if (!isStaff(message.member)) return message.reply('Staff only.');
        data.staffApplyOpen = false;
        saveData();
        return message.reply('🔒 **Staff applications are now CLOSED.**');
      }
      if (mode === 'open') {
        if (!isStaff(message.member)) return message.reply('Staff only.');
        data.staffApplyOpen = true;
        saveData();
        return message.reply('🔓 **Staff applications are now OPEN.**');
      }

      // user applying
      if (!isStaffApplyChannel(message.channel) && !isTicketChannel(message.channel)) {
        return message.reply(
          '`$staff apply` only works in a **staff-apply** ticket (name starts with `staff-apply`).'
        );
      }
      if (!isStaffApplyChannel(message.channel)) {
        return message.reply(
          'Open / use a ticket whose name starts with **`staff-apply`**, then run `$staff apply`.'
        );
      }
      if (!data.staffApplyOpen) {
        return message.reply('**Staff apply is currently closed !**');
      }

      const questions = [
        'How long have you been in Ultimate Rewards / this community?',
        'Why do you want to join the staff team?',
        'What skills or strengths make you a strong staff candidate?',
        'Have you had any previous staff / moderation experience? (where & what)',
        'How many hours per day/week can you be active on Discord?',
        'How would you handle a member clearly breaking the rules?',
        'Two members are arguing in chat — what do you do step by step?',
        'Your close friend breaks a rule — how do you handle it fairly?',
        'How would you deal with a difficult or disrespectful member?',
        'Why should Ultimate Rewards choose *you* over other applicants?',
        'Full form of MCFA, SMFA, NFA, FA?',
        'Will you use stocks as your salary?'
      ];

      await message.reply(
        '📋 **Staff Application** — answer each question in this ticket.\n' +
          'Type `cancel` anytime to stop.'
      );

      const answers = [];
      for (let i = 0; i < questions.length; i++) {
        await message.channel.send(`**${i + 1}/${questions.length}.** ${questions[i]}`);
        const collected = await message.channel
          .awaitMessages({
            filter: (m) => m.author.id === message.author.id && !m.author.bot,
            max: 1,
            time: 10 * 60 * 1000
          })
          .catch(() => null);
        if (!collected || !collected.size) {
          await message.channel.send('Timed out. Run `$staff apply` again when ready.');
          return;
        }
        const ans = collected.first().content.trim();
        if (ans.toLowerCase() === 'cancel') {
          await message.channel.send('Application cancelled.');
          return;
        }
        answers.push({ q: questions[i], a: ans });
      }

      const appId = `${message.author.id}-${Date.now()}`;
      if (!data.staffApplications) data.staffApplications = {};
      data.staffApplications[appId] = {
        userId: message.author.id,
        at: new Date().toISOString(),
        answers
      };
      saveData();

      const summary = answers
        .map((x, i) => `**${i + 1}.** ${x.q}\n> ${x.a}`)
        .join('\n\n');
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📨 Staff Application Submitted')
        .setDescription(summary.slice(0, 4000))
        .setFooter({ text: message.author.tag })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });

      const ownerPing = OWNER_ROLE_ID ? `<@&${OWNER_ROLE_ID}>` : '@owner';
      await message.channel.send(
        `${ownerPing}
${message.author}'s **staff application is ready** — please review.`
      );

      return;
    }

    return message.reply(
      '`$staff apply` — apply in a ticket\n' +
        '`$staff apply OPEN` / `$staff apply CLOSED` — staff toggle'
    );
  }



  // ========== $settings export / import (messages + invites backup) ==========
  if (cmd === 'settings' || cmd === 'setting' || cmd === 'settungs') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const sub = (args[0] || '').toLowerCase();
    const gid = message.guild.id;

    if (sub === 'export') {
      const ch =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get((args[1] || '').replace(/[<#>]/g, '')) ||
        message.channel;

      if (!ch || !ch.isTextBased?.()) {
        return message.reply('Usage: `$settings export #channel`');
      }

      if (!data.exportCounts) data.exportCounts = { mcfa: 0, custom: 0, hits: 0, settings: 0 };
      data.exportCounts.settings = (data.exportCounts.settings || 0) + 1;
      const n = data.exportCounts.settings;
      saveData();

      const payload = {
        type: 'ultimate-staff-settings',
        version: 1,
        exportedAt: new Date().toISOString(),
        exportedBy: message.author.id,
        guildId: gid,
        messages: data.messages[gid] || {},
        invites: data.invites[gid] || {},
        inviteUses: data.inviteUses[gid] || {},
        coins: data.coins || {},
        daily: data.daily || {}
      };

      const filename = `settings_export_${n}.json`;
      const body = JSON.stringify(payload, null, 2);
      const file = new AttachmentBuilder(Buffer.from(body, 'utf8'), { name: filename });

      await ch.send({
        content:
          `📤 **Settings export** \`${filename}\`\n` +
          `Messages users: **${Object.keys(payload.messages).length}** · ` +
          `Invite users: **${Object.keys(payload.invites).length}**\n` +
          `Import later: \`$settings import ${'{message_id}'}\` (reply to this file or paste ID)`,
        files: [file]
      });
      return message.reply(`Exported settings into ${ch} as **${filename}**.`);
    }

    if (sub === 'import') {
      let msgId = (args[1] || '').replace(/\D/g, '');
      // allow reply-to import
      if (!msgId && message.reference?.messageId) {
        msgId = message.reference.messageId;
      }
      if (!msgId) {
        return message.reply(
          'Usage: `$settings import <message_id>`\n' +
            'Or reply to the export message with `$settings import`'
        );
      }

      let targetMsg = null;
      // search current channel then common channels
      try {
        targetMsg = await message.channel.messages.fetch(msgId);
      } catch (_) {}
      if (!targetMsg) {
        for (const ch of message.guild.channels.cache.values()) {
          if (!ch.isTextBased?.()) continue;
          try {
            targetMsg = await ch.messages.fetch(msgId);
            if (targetMsg) break;
          } catch (_) {}
        }
      }
      if (!targetMsg) {
        return message.reply('Could not find that message ID in this server.');
      }

      let jsonText = null;
      if (targetMsg.attachments.size) {
        const att = targetMsg.attachments.find(
          (a) =>
            (a.name || '').endsWith('.json') ||
            (a.contentType || '').includes('json') ||
            (a.name || '').includes('settings')
        ) || targetMsg.attachments.first();
        if (att) {
          const res = await fetch(att.url);
          jsonText = await res.text();
        }
      }
      if (!jsonText) {
        const m = targetMsg.content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m) jsonText = m[1];
      }
      if (!jsonText) {
        return message.reply('No `.json` attachment or JSON code block found on that message.');
      }

      let payload;
      try {
        payload = JSON.parse(jsonText);
      } catch (e) {
        return message.reply('Invalid JSON in that export.');
      }

      if (!payload || typeof payload !== 'object') {
        return message.reply('Empty export payload.');
      }

      // merge messages/invites for this guild (or payload.guildId)
      const targetGid = payload.guildId || gid;
      if (!data.messages[targetGid]) data.messages[targetGid] = {};
      if (!data.invites[targetGid]) data.invites[targetGid] = {};
      if (!data.inviteUses[targetGid]) data.inviteUses[targetGid] = {};

      const msgIn = payload.messages || {};
      const invIn = payload.invites || {};
      const usesIn = payload.inviteUses || {};

      let msgCount = 0;
      let invCount = 0;
      for (const [uid, count] of Object.entries(msgIn)) {
        data.messages[targetGid][uid] = Math.max(
          data.messages[targetGid][uid] || 0,
          Number(count) || 0
        );
        msgCount++;
      }
      for (const [uid, count] of Object.entries(invIn)) {
        data.invites[targetGid][uid] = Math.max(
          data.invites[targetGid][uid] || 0,
          Number(count) || 0
        );
        invCount++;
      }
      for (const [code, info] of Object.entries(usesIn)) {
        data.inviteUses[targetGid][code] = info;
      }
      if (payload.coins && typeof payload.coins === 'object') {
        data.coins = { ...data.coins, ...payload.coins };
      }
      if (payload.daily && typeof payload.daily === 'object') {
        data.daily = { ...data.daily, ...payload.daily };
      }
      saveData();

      return message.reply(
        `✅ **Settings imported** from \`${msgId}\`\n` +
          `Message records: **${msgCount}** users · Invite records: **${invCount}** users\n` +
          `(Merged with max counts — existing higher values kept.)`
      );
    }

    return message.reply(
      '**Settings backup**\n' +
        '`$settings export #channel` — save messages + invites as JSON file\n' +
        '`$settings import <message_id>` — restore from that export message\n' +
        'Or **reply** to the export message: `$settings import`'
    );
  }



  // ========== $invites — show Falcon-synced invite count ==========
  if (cmd === 'invites' || cmd === 'falcon') {
    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null))) ||
      message.author;
    const count = getUserInvites(message.guild.id, user.id);
    const meta = data.falconInvites?.[message.guild.id]?.[user.id];
    return message.reply(
      `**${user.username}** invites (Falcon-synced): **${count}**` +
        (meta?.at ? `\nLast Falcon sync: <t:${Math.floor(new Date(meta.at).getTime() / 1000)}:R>` : '') +
        `\n\n_Refresh: run \`-i @${user.username}\` (Falcon) in this server — Staff Bot auto-reads it._`
    );
  }


  // ========== $cstatus — check free-gen status requirement ==========
  if (cmd === 'cstatus') {
    const member = message.member;
    if (!member) return message.reply('Members only.');
    const custom = member.presence?.activities?.find((a) => a.type === 4); // Custom
    const statusText = custom?.state || '';
    const ok = statusText && statusText.includes(FREE_STATUS_TEXT);
    const role = message.guild.roles.cache.get(FREE_GEN_ROLE_ID);
    const hasRole = role && member.roles.cache.has(FREE_GEN_ROLE_ID);

    if (ok) {
      if (role && !hasRole) {
        await member.roles.add(role).catch(() => {});
      }
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('✅ Status check')
            .setDescription(
              `Your status matches:\n\`${FREE_STATUS_TEXT}\`\n\n` +
                `Free gen role: **${hasRole || role ? 'YES' : 'added'}** <@&${FREE_GEN_ROLE_ID}>\n` +
                `Use \`$fgen <product>\` e.g. \`$fgen mcfa\``
            )
        ]
      });
    }
    if (role && hasRole) {
      await member.roles.remove(role).catch(() => {});
    }
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Status not set')
          .setDescription(
            `Set your **custom status** exactly including:\n\`\`\`\n${FREE_STATUS_TEXT}\n\`\`\`\n` +
              `Then run \`$cstatus\` again.\n\n` +
              `**Paid gen:** $3 — open a ticket and ping <@&${OWNZ_ROLE_ID}>`
          )
      ]
    });
  }

  // ========== $fgen / $pgen — gen DM (free OR paid role) ==========
  if (cmd === 'fgen' || cmd === 'pgen' || cmd === 'paidgen') {
    const member = message.member;
    if (!member) return message.reply('Members only.');

    const hasFree = member.roles.cache.has(FREE_GEN_ROLE_ID);
    const hasPaid = member.roles.cache.has(PAID_GEN_ROLE_ID);
    const isStaffUser = isStaff(member);

    // $pgen with no product → how to buy
    if ((cmd === 'pgen' || cmd === 'paidgen') && !args[0]) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle('💎 Paid Gen')
            .setDescription(
              `**Price:** $3 USD\n` +
                `1. Open a **ticket**\n` +
                `2. Ping <@&${OWNZ_ROLE_ID}> (**Ownz**)\n` +
                `3. Pay → get <@&${PAID_GEN_ROLE_ID}>\n` +
                `4. Then run: \`$pgen mcfa\` or \`$fgen mcfa\`\n\n` +
                `Website: ${ULTIMATE_WEB}`
            )
        ]
      });
    }

    if (!hasFree && !hasPaid && !isStaffUser) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ No gen access')
            .setDescription(
              `**Free:** status \`${FREE_STATUS_TEXT}\` → \`$cstatus\`\n` +
                `**Paid:** $3 → role <@&${PAID_GEN_ROLE_ID}> → \`$pgen mcfa\``
            )
        ]
      });
    }

    const product = resolveProductKey(args[0] || 'mcfa') || 'mcfa';
    const meta = PRODUCT_STOCKS[product];
    if (!meta) return message.reply('Unknown product. Try: mcfa, xbox, netflix, crunchyroll, …');
    const taken = await takeFromStock(product, 1);
    if (!taken) {
      return message.reply(`**${meta.label}** stock is empty. Try another product or wait for restock.`);
    }
    const ok = await deliverProductWithVouch(message, message.author, product, taken, true);
    if (!ok) {
      const arr = getStock(product);
      arr.unshift(taken[0]);
      setStock(product, arr);
      saveData();
      return message.reply('Could not DM you — open your DMs and try again. Stock restored.');
    }
    const tier = hasPaid ? 'Paid' : hasFree ? 'Free' : 'Staff';
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(hasPaid ? 0xfee75c : 0x57f287)
          .setTitle(`✅ ${tier} gen sent`)
          .setDescription(
            `**${meta.emoji} ${meta.label}** sent to your **DMs**.\n# ARE WE LEGIT?\nCheck your DMs.`
          )
      ]
    });
  }

  // ========== $msg — set / post role tutorial ==========
  if (cmd === 'msg') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    if (!data.msgFree) data.msgFree = '';
    if (!data.msgPaid) data.msgPaid = '';

    const sub = (args[0] || '').toLowerCase();
    const sub2 = (args[1] || '').toLowerCase();

    // $msg free set <text>
    // $msg paid set <text>
    // $msg set free <text>  (alt)
    // $msg free  → post free embed
    // $msg paid  → post paid embed
    // $msg       → post both

    const isFree = sub === 'free' || sub2 === 'free';
    const isPaid = sub === 'paid' || sub2 === 'paid';
    const isSet = sub === 'set' || sub2 === 'set';

    if (isSet && (isFree || isPaid || sub === 'set')) {
      // Find text after "set"
      const idx = body.toLowerCase().indexOf('set');
      let rest = idx >= 0 ? body.slice(idx + 3).trim() : '';
      // strip leading free/paid keyword if present after set
      rest = rest.replace(/^(free|paid)\s+/i, '').trim();
      // if order was $msg free set ...
      if ((sub === 'free' || sub === 'paid') && sub2 === 'set') {
        const i2 = body.toLowerCase().indexOf('set');
        rest = i2 >= 0 ? body.slice(i2 + 3).trim() : rest;
      }
      if (!rest) {
        return message.reply(
          'Usage:\n' +
            '`$msg free set <text>`\n' +
            '`$msg paid set <text>`'
        );
      }
      if (isFree || (sub === 'set' && args[1]?.toLowerCase() === 'free')) {
        data.msgFree = rest;
        saveData();
        return message.reply('✅ **Free Gen** tutorial text saved. Post with `$msg free`.');
      }
      if (isPaid || (sub === 'set' && args[1]?.toLowerCase() === 'paid')) {
        data.msgPaid = rest;
        saveData();
        return message.reply('✅ **Paid Gen** tutorial text saved. Post with `$msg paid`.');
      }
      // bare $msg set → save as free by default
      data.msgFree = rest;
      saveData();
      return message.reply('Saved as **Free** text. Use `$msg free set` / `$msg paid set` for separate ones.');
    }

    const defaultFree =
      `Add our status text to your **Discord custom status** to get instant access to **Free Gen**!\n\n` +
      `📌 **Copy & Paste status text below:**\n` +
      `\`\`\`\n${FREE_STATUS_TEXT}\n\`\`\`\n` +
      `➡️ **Once updated**, your **Free Gen** role will be granted automatically!\n` +
      `(Or run \`$cstatus\` to check / refresh.)\n\n` +
      `Then use \`$fgen mcfa\` (or xbox / netflix / …) to receive stock in **DMs**.`;

    const defaultPaid =
      `**Price: $3 USD**\n\n` +
      `1️⃣ Create a **ticket**\n` +
      `2️⃣ Pay **$3** to **Ownz** <@&${OWNZ_ROLE_ID}>\n` +
      `3️⃣ Staff will give you the **Paid Gen** role <@&${PAID_GEN_ROLE_ID}>\n\n` +
      `Website: ${ULTIMATE_WEB}`;

    const freeEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🟢 ACCESS FREE GEN')
      .setDescription((data.msgFree || defaultFree).slice(0, 4000))
      .setFooter({ text: 'Ultimate Rewards / Ultimate Rewards' })
      .setTimestamp();

    const paidEmbed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('💎 ACCESS PAID GEN')
      .setDescription((data.msgPaid || defaultPaid).slice(0, 4000))
      .setFooter({ text: 'Ultimate Rewards / Ultimate Rewards' })
      .setTimestamp();

    if (sub === 'free') {
      return message.channel.send({ embeds: [freeEmbed] });
    }
    if (sub === 'paid') {
      return message.channel.send({ embeds: [paidEmbed] });
    }
    if (!sub) {
      return message.channel.send({ embeds: [freeEmbed, paidEmbed] });
    }

    return message.reply(
      '**Tutorial embeds**\n' +
        '`$msg free set <text>` — save Free Gen message\n' +
        '`$msg paid set <text>` — save Paid Gen message\n' +
        '`$msg free` — post Free embed\n' +
        '`$msg paid` — post Paid embed\n' +
        '`$msg` — post both'
    );
  }




  // ========== $mclaim — message milestone rewards (tickets) ==========
  if (cmd === 'mclaim') {
    if (!isTicketChannel(message.channel) && !isStaffApplyChannel(message.channel)) {
      return message.reply('`$mclaim` only works **inside tickets**.');
    }
    const gid = message.guild.id;
    const uid = message.author.id;
    const msgs = data.messages[gid]?.[uid] || 0;
    const eligible = MESSAGE_REWARDS.filter((r) => msgs >= r.messages);
    const lines = MESSAGE_REWARDS.map((r) => {
      const ok = msgs >= r.messages ? '✅' : '🔒';
      return `${ok} \`${r.id}.\` **${r.messages.toLocaleString()} msgs** → **${r.name}**`;
    });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('💬 Message rewards')
      .setDescription(
        `**Your messages (bot-tracked):** \`${msgs.toLocaleString()}\`\n` +
          `_Meaningful chat only — staff verify before pay._\n\n` +
          lines.join('\n') +
          `\n\nReply with a **number** to request that reward (staff will confirm).`
      )
      .setFooter({ text: 'Ultimate Rewards • Methods are message rewards' });
    await message.channel.send({ content: `${message.author}`, embeds: [embed] });

    if (!eligible.length) return;

    const collector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === uid && !m.author.bot,
      time: 5 * 60 * 1000,
      max: 8
    });
    collector.on('collect', async (m) => {
      const num = parseInt(m.content.trim(), 10);
      const chosen = eligible.find((r) => r.id === num);
      if (!chosen) {
        await message.channel.send(`${message.author} Pick a number you unlocked.`).catch(() => {});
        return;
      }
      collector.stop('ok');
      if (!data.methodTexts) data.methodTexts = {};
      const body = data.methodTexts[chosen.name] || data.methodTexts[chosen.name.toLowerCase()];
      if (body) {
        await message.channel.send({
          content: `${message.author}`,
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('📘 Message milestone — method delivered')
              .setDescription(
                `**Reward:** ${chosen.name}\n` +
                  `**Messages:** ${msgs.toLocaleString()} (need ${chosen.messages.toLocaleString()})\n\n` +
                  `Method text is **unlimited**.`
              )
              .setFooter({ text: 'Ultimate Rewards • Message claim' })
          ]
        }).catch(() => {});
        let rem = String(body);
        while (rem.length) {
          await message.channel.send(rem.slice(0, 1900)).catch(() => {});
          rem = rem.slice(1900);
        }
      } else {
        const staffPing = STAFF_TEAM_ROLE_ID
          ? `<@&${STAFF_TEAM_ROLE_ID}>`
          : OWNER_ROLE_ID
            ? `<@&${OWNER_ROLE_ID}>`
            : '@staff';
        await message.channel.send(
          `${staffPing}\n${message.author} requests **message reward**: **${chosen.name}** ` +
            `(need ${chosen.messages.toLocaleString()} · has ${msgs.toLocaleString()}).\n` +
            `Method text not set — staff: \`$method set ${chosen.name} | text\``
        );
      }
      try {
        const pingPayload = await pingOnlineRewardStaff(message.guild, message.author, chosen.name);
        if (pingPayload) await message.channel.send(pingPayload).catch(() => {});
      } catch (_) {}
    });
    return;
  }


  // ========== $inv — Falcon invite
  // ========== $inv — Falcon invites ==========
  if (cmd === 'inv' || cmd === 'invites' || cmd === 'falcon') {
    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null))) ||
      message.author;
    const count = getUserInvites(message.guild.id, user.id);
    const meta = data.falconInvites?.[message.guild.id]?.[user.id];
    const name = user.username;
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📨 Invites (Falcon)')
          .setDescription(
            `**${name}**\n` +
              `Invites: **${count}**\n` +
              (meta?.at
                ? `Last Falcon sync: <t:${Math.floor(new Date(meta.at).getTime() / 1000)}:R>\n`
                : `Not synced yet — run Falcon \`-i ${name}\` in this server.\n`) +
              `_Source: Falcon bot_`
          )
      ]
    });
  }

  // ========== $m — messages (Falcon when synced) ==========
  if (cmd === 'm' || cmd === 'messages' || cmd === 'msgcount') {
    const user =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null))) ||
      message.author;
    const count = data.messages[message.guild.id]?.[user.id] || 0;
    const meta = data.falconMessages?.[message.guild.id]?.[user.id];
    const name = user.username;
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('💬 Messages')
          .setDescription(
            `**${name}**\n` +
              `Messages: **${count.toLocaleString()}**\n` +
              (meta?.at
                ? `Last Falcon sync: <t:${Math.floor(new Date(meta.at).getTime() / 1000)}:R>\n`
                : `Tracked by bot; also syncs when Falcon posts message stats.\n`) +
              `_Use \`$mclaim\` in a ticket for message rewards._`
          )
      ]
    });
  }

  // ========== $lb inv | $lb m — leaderboard (no pings) ==========
  if (cmd === 'lb' || cmd === 'leaderboard') {
    const sub = (args[0] || 'inv').toLowerCase();
    const gid = message.guild.id;

    if (sub === 'inv' || sub === 'invite' || sub === 'invites' || sub === 'i') {
      const map = data.invites[gid] || {};
      const sorted = Object.entries(map)
        .map(([id, c]) => ({ id, c: Number(c) || 0 }))
        .filter((x) => x.c > 0)
        .sort((a, b) => b.c - a.c)
        .slice(0, 15);
      if (!sorted.length) {
        return message.reply('No invite data yet. Sync with Falcon `-i`.');
      }
      await message.guild.members.fetch().catch(() => {});
      const lines = sorted.map((x, i) => {
        const mem = message.guild.members.cache.get(x.id);
        const name = mem?.displayName || mem?.user?.username || `User ${x.id.slice(-4)}`;
        return `**${i + 1}.** ${name} — **${x.c}** invites`;
      });
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🏆 Invite leaderboard (Falcon)')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Names only — no pings' })
        ]
      });
    }

    if (sub === 'm' || sub === 'msg' || sub === 'messages') {
      const map = data.messages[gid] || {};
      const sorted = Object.entries(map)
        .map(([id, c]) => ({ id, c: Number(c) || 0 }))
        .filter((x) => x.c > 0)
        .sort((a, b) => b.c - a.c)
        .slice(0, 15);
      if (!sorted.length) {
        return message.reply('No message data yet.');
      }
      await message.guild.members.fetch().catch(() => {});
      const lines = sorted.map((x, i) => {
        const mem = message.guild.members.cache.get(x.id);
        const name = mem?.displayName || mem?.user?.username || `User ${x.id.slice(-4)}`;
        return `**${i + 1}.** ${name} — **${x.c.toLocaleString()}** msgs`;
      });
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🏆 Message leaderboard')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Names only — no pings' })
        ]
      });
    }

    return message.reply('`$lb inv` — invites · `$lb m` — messages');
  }

  // ========== $ai set #channel — AI only works there ==========
  if (cmd === 'ai') {
    if (!isStaff(message.member)) return message.reply('Staff only.');
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'set') {
      const ch =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get((args[1] || '').replace(/[<#>]/g, ''));
      if (!ch) return message.reply('Usage: `$ai set #channel`');
      data.aiChannelId = ch.id;
      saveData();
      return message.reply(`AI will only reply in ${ch}. Clear with \`$ai clear\`.`);
    }
    if (sub === 'clear') {
      data.aiChannelId = null;
      saveData();
      return message.reply('AI channel lock cleared — AI works anywhere when @mentioned.');
    }
    if (sub === 'status' || !sub) {
      if (data.aiChannelId) {
        return message.reply(`AI channel: <#${data.aiChannelId}>`);
      }
      return message.reply('AI channel: **not set** (works in all channels when @mentioned).');
    }
    return message.reply('`$ai set #channel` · `$ai clear` · `$ai status`');
  }

  // ========== $help ==========
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Ultimate Rewards Bot — Commands')
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
                    '`$stock list` — all product counts (emoji UI)',
          '`$mcfa/$donut/$hypixel/$nitro/$netflix/$steam/$crunchyroll/$xbox` — stock cmds',
          '`$pay @user [product] [n]` — pay + yes/no vouch flow',
          '`$staff apply` · OPEN/CLOSED — staff applications (tickets)',
          '`$birthday gift @user` — owner only',
          '`$pay @user` / `$pay @user netflix 2` — pay with vouch flow',
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

    // Staff-apply tickets → welcome + how to start (like $claim prompt)
    if (name.startsWith('staff-apply') || name.startsWith('staffapply') || name.includes('staff-apply')) {
      await new Promise((r) => setTimeout(r, 2000));
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📋 Staff Application')
            .setDescription(
              `Welcome to **Ultimate Rewards** staff applications.\n\n` +
                `Type \`$staff apply\` here to start the questions (1–12).\n` +
                `Type \`cancel\` anytime to stop.\n\n` +
                `Owner is pinged when you finish.`
            )
            .setFooter({ text: 'Ultimate Rewards • Staff Apply' })
            .setTimestamp()
        ]
      }).catch(() => {});
      return;
    }

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

