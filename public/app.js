async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  if (path === '/api/export') return r;
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) {
    showGate(j.error || 'Login required');
    throw new Error(j.error || 'auth');
  }
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function showGate(err) {
  document.getElementById('gate').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  if (err) document.getElementById('gateErr').textContent = err;
}

function showApp() {
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function setTab(name) {
  document.querySelectorAll('[id^="tab-"]').forEach((el) => el.classList.add('hidden'));
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.remove('hidden');
  document.querySelectorAll('#nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
}

async function boot() {
  const s = await api('/api/status');
  if (!s.authed) {
    showGate(s.error || 'Not logged in');
    if (s.hint) document.getElementById('gateHint').textContent = s.hint;
    return;
  }
  showApp();
  document.getElementById('me').textContent = s.userTag || s.userId || 'staff';
  document.getElementById('botStatus').textContent = s.online
    ? 'Bot: ' + (s.tag || 'online')
    : 'Bot starting…';
  if (s.defaultGuildId) document.getElementById('guildId').value = s.defaultGuildId;
  if (s.settings) {
    document.getElementById('aiChannel').value = s.settings.aiChannelId || '';
    document.getElementById('autoExportMin').value = s.settings.autoExportMinutes || 0;
    document.getElementById('autoExportChannel').value = s.settings.autoExportChannelId || '';
    document.getElementById('bdayUser').value = s.settings.birthdayUserId || '';
  }
  await loadStock();
  await loadHits();
  await loadTop('inv');
  await loadTop('msg');
}

async function loadUser() {
  const j = await api(
    '/api/user?guildId=' +
      encodeURIComponent(document.getElementById('guildId').value.trim()) +
      '&userId=' +
      encodeURIComponent(document.getElementById('userId').value.trim())
  );
  document.getElementById('invites').value = j.invites || 0;
  document.getElementById('messages').value = j.messages || 0;
  document.getElementById('editMsg').textContent = 'Loaded.';
}

async function saveUser() {
  await api('/api/user', {
    method: 'POST',
    body: JSON.stringify({
      guildId: document.getElementById('guildId').value.trim(),
      userId: document.getElementById('userId').value.trim(),
      invites: Number(document.getElementById('invites').value || 0),
      messages: Number(document.getElementById('messages').value || 0)
    })
  });
  document.getElementById('editMsg').innerHTML = '<span class="status">Saved to bot.</span>';
  await loadTop('inv');
  await loadTop('msg');
}

async function loadTop(kind) {
  const guildId = document.getElementById('guildId').value.trim();
  const j = await api('/api/top?kind=' + kind + '&guildId=' + encodeURIComponent(guildId));
  const tb = document.getElementById(kind === 'inv' ? 'topInv' : 'topMsg');
  tb.innerHTML =
    (j.rows || [])
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td><span class="pill">${r.userId}</span></td><td><b>${r.count}</b></td></tr>`
      )
      .join('') || '<tr><td colspan="3">No data</td></tr>';
}

async function loadStock() {
  const j = await api('/api/stock');
  const grid = document.getElementById('stockGrid');
  grid.innerHTML = Object.entries(j.stocks || {})
    .map(
      ([k, n]) =>
        `<div class="stock-item"><span>${k}</span><b>${n}</b></div>`
    )
    .join('');
}

async function addStock() {
  const product = document.getElementById('stockProduct').value;
  const lines = document.getElementById('stockLines').value;
  const j = await api('/api/stock', {
    method: 'POST',
    body: JSON.stringify({ product, lines })
  });
  document.getElementById('stockMsg').innerHTML =
    `<span class="status">Added ${j.added || 0}. Total ${j.total}</span>`;
  document.getElementById('stockLines').value = '';
  await loadStock();
}

async function loadHits() {
  const j = await api('/api/hits');
  document.getElementById('hitsCount').textContent = j.count || 0;
}

async function clearHits() {
  await api('/api/hits', { method: 'DELETE', body: '{}' });
  document.getElementById('hitsMsg').innerHTML = '<span class="status">Hits cleared</span>';
  await loadHits();
}

async function ecoLoad() {
  const j = await api('/api/economy?userId=' + encodeURIComponent(document.getElementById('ecoUser').value.trim()));
  document.getElementById('ecoCoins').value = j.coins || 0;
  document.getElementById('ecoMsg').textContent = 'Loaded.';
}

async function ecoSave() {
  await api('/api/economy', {
    method: 'POST',
    body: JSON.stringify({
      userId: document.getElementById('ecoUser').value.trim(),
      coins: Number(document.getElementById('ecoCoins').value || 0)
    })
  });
  document.getElementById('ecoMsg').innerHTML = '<span class="status">Coins updated</span>';
}

async function saveSettings() {
  await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({
      aiChannelId: document.getElementById('aiChannel').value.trim() || null,
      autoExportMinutes: Number(document.getElementById('autoExportMin').value || 0),
      autoExportChannelId: document.getElementById('autoExportChannel').value.trim() || null,
      birthdayUserId: document.getElementById('bdayUser').value.trim() || null
    })
  });
  document.getElementById('settingsMsg').innerHTML = '<span class="status">Settings saved</span>';
  document.getElementById('bdayMsg').innerHTML = '<span class="status">Birthday user saved</span>';
}

async function importFile() {
  const f = document.getElementById('importFile').files[0];
  if (!f) {
    document.getElementById('backupMsg').textContent = 'Choose a JSON file first';
    return;
  }
  const text = await f.text();
  await api('/api/import', { method: 'POST', body: text, headers: { 'Content-Type': 'application/json' } });
  document.getElementById('backupMsg').innerHTML = '<span class="status">Import applied</span>';
  await loadStock();
  await loadHits();
}

document.getElementById('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
});
document.getElementById('btnLoad').onclick = () => loadUser().catch((e) => (document.getElementById('editMsg').textContent = e.message));
document.getElementById('btnSave').onclick = () => saveUser().catch((e) => (document.getElementById('editMsg').textContent = e.message));
document.getElementById('btnTopInv').onclick = () => loadTop('inv');
document.getElementById('btnTopMsg').onclick = () => loadTop('msg');
document.getElementById('btnAddStock').onclick = () => addStock().catch((e) => (document.getElementById('stockMsg').textContent = e.message));
document.getElementById('btnHitsRefresh').onclick = () => loadHits();
document.getElementById('btnHitsClear').onclick = () => clearHits().catch((e) => (document.getElementById('hitsMsg').textContent = e.message));
document.getElementById('btnEcoLoad').onclick = () => ecoLoad().catch((e) => (document.getElementById('ecoMsg').textContent = e.message));
document.getElementById('btnEcoSave').onclick = () => ecoSave().catch((e) => (document.getElementById('ecoMsg').textContent = e.message));
document.getElementById('btnBdaySave').onclick = () => saveSettings().catch((e) => (document.getElementById('bdayMsg').textContent = e.message));
document.getElementById('btnSettingsSave').onclick = () => saveSettings().catch((e) => (document.getElementById('settingsMsg').textContent = e.message));
document.getElementById('btnImport').onclick = () => importFile().catch((e) => (document.getElementById('backupMsg').textContent = e.message));
document.getElementById('btnExport').onclick = async (e) => {
  e.preventDefault();
  const r = await fetch('/api/export', { credentials: 'same-origin' });
  if (r.status === 401) return showGate('Login required');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ultimate-data.json';
  a.click();
};

boot().catch(() => showGate(''));
