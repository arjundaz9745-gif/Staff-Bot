// middleware/auth.js — Discord OAuth session helpers
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('=') || '');
  }
  return '';
}

function createAuth(opts) {
  const {
    cookieName = 'ur_dash_uid',
    sessions,
    clientId,
    clientSecret,
    redirectUri,
    canAccess
  } = opts;

  return {
    getLoggedUid(req) {
      const uid = getCookie(req, cookieName);
      if (!uid || !sessions.has(uid)) return null;
      return uid;
    },
    setUidCookie(res, uid) {
      res.setHeader(
        'Set-Cookie',
        `${cookieName}=${encodeURIComponent(uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      );
    },
    clearUidCookie(res) {
      res.setHeader('Set-Cookie', `${cookieName}=; Path=/; Max-Age=0`);
    },
    clientId,
    clientSecret,
    redirectUri,
    canAccess
  };
}

module.exports = { getCookie, createAuth };
