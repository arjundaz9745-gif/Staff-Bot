const STAFF_CHAT = '1547183225317883954';
const STAFF_CMD = '1547183226827702312';

let activeTicket = null;
let togglesCache = null;

async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) {
    document.getElementById('gate').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    throw new Error(j.error || 'Login required');
  }
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function tab(name) {
  document.querySelectorAll('[id^=tab-]').forEach((e) => e.classList.add('hidden'));
  document.getElementById('tab-' + name)?.classList.remove('hidden');
  document.querySelectorAll('#nav button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.getElementById('nav').classList.remove('open');
  if (name === 'tickets') loadTickets();
  if (name === 'staffchat') loadChannel(STAFF_CHAT, 'staffChatBox');
  if (name === 'staffcmd') loadChannel(STAFF_CMD, 'staffCmdBox');
  if (name === 'stock') loadStock();
  if (name === 'methods') loadMethods();
  if (name === 'settings') loadToggles();
}

function switchEl(on) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'switch' + (on ? ' on' : '');
  b.innerHTML = '<i></i>';
  return b;
}

function renderToggleRow(parent, label, key, group, value) {
  const row = document.createElement('div');
  row.className = 'toggle';
  const lab = document.createElement('span');
  lab.className = 'label';
  lab.textContent = label;
  const sw = switchEl(!!value);
  sw.onclick = async () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    const body = {};
    body[group] = { [key]: next };
    try {
      await api('/api/toggles', { method: 'POST', body: JSON.stringify(body) });
    } catch (e) {
      sw.classList.toggle('on', !next);
      alert(e.message);
    }
  };
  row.appendChild(lab);
  row.appendChild(sw);
  parent.appendChild(row);
}

function renderMsgs(boxId, messages) {
  const box = document.getElementById(boxId);
  box.innerHTML = '';
  (messages || []).forEach((m) => {
    const div = document.createElement('div');
    div.className = 'msg';
    const img = document.createElement('img');
    img.src = m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
    img.alt = '';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = `${m.author}${m.bot ? ' <span class="bot">APP</span>' : ''} · ${new Date(m.time).toLocaleString()}`;
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = m.content || '—';
    bubble.appendChild(who);
    bubble.appendChild(txt);
    div.appendChild(img);
    div.appendChild(bubble);
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

async function loadChannel(channelId, boxId) {
  try {
    const j = await api('/api/messages?channelId=' + encodeURIComponent(channelId) + '&limit=40');
    renderMsgs(boxId, j.messages);
  } catch (e) {
    document.getElementById(boxId).innerHTML = `<p class="muted">${e.message}</p>`;
  }
}

async function sendTo(channelId, inputId, boxId) {
  const input = document.getElementById(inputId);
  const content = input.value.trim();
  if (!content) return;
  try {
    await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channelId, content })
    });
    input.value = '';
    await loadChannel(channelId, boxId);
  } catch (e) {
    alert(e.message);
  }
}

async function loadTickets() {
  const list = document.getElementById('ticketList');
  list.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const j = await api('/api/tickets');
    list.innerHTML = '';
    if (!j.tickets?.length) {
      list.innerHTML = '<p class="muted">No ticket channels found</p>';
      return;
    }
    j.tickets.forEach((t) => {
      const el = document.createElement('div');
      el.className = 'ticket-item' + (activeTicket === t.id ? ' active' : '');
      el.innerHTML = `<div><b>#${t.name}</b><div class="muted">${t.parent || ''}</div></div>`;
      el.onclick = async () => {
        activeTicket = t.id;
        document.getElementById('ticketTitle').textContent = '#' + t.name;
        loadTickets();
        await loadChannel(t.id, 'ticketChat');
      };
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = `<p class="muted">${e.message}</p>`;
  }
}

async function loadStock() {
  try {
    const j = await api('/api/stock');
    const el = document.getElementById('stockOut');
    el.innerHTML = Object.entries(j.stocks || j || {})
      .map(([k, v]) => {
        const n = typeof v === 'object' ? v.count ?? v.length ?? JSON.stringify(v) : v;
        return `<div class="toggle"><span class="label">${k}</span><b>${n}</b></div>`;
      })
      .join('') || '<p class="muted">Empty</p>';
  } catch (e) {
    document.getElementById('stockOut').textContent = e.message;
  }
}

async function loadMethods() {
  try {
    const j = await api('/api/methods');
    const tiers = document.getElementById('rewardTiersOut');
    const inv = (j.inviteRewards || []).map((r) =>
      `<div class="toggle"><span class="label">${r.invites} inv · ${r.type}</span><b>${r.name}</b></div>`
    ).join('');
    const msg = (j.messageRewards || []).map((r) =>
      `<div class="toggle"><span class="label">${r.messages} msgs</span><b>${r.name}</b></div>`
    ).join('');
    tiers.innerHTML =
      '<p class="muted" style="margin:0 0 6px">Invite rewards</p>' + (inv || '<p class="muted">—</p>') +
      '<p class="muted" style="margin:12px 0 6px">Message milestones</p>' + (msg || '<p class="muted">—</p>');

    const dl = document.getElementById('methodCatalog');
    if (dl) {
      const names = new Set([
        ...(j.catalog || []),
        ...(j.inviteRewards || []).filter((r) => r.type === 'method').map((r) => r.name),
        ...(j.messageRewards || []).map((r) => r.name),
        ...(j.methods || []).map((m) => m.name)
      ]);
      dl.innerHTML = [...names].map((n) => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
    }

    const el = document.getElementById('methodsOut');
    if (!(j.methods || []).length) {
      el.innerHTML = '<p class="muted">No method texts saved yet. Add one below.</p>';
    } else {
      el.innerHTML = j.methods.map((m) =>
        `<div class="toggle" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div style="display:flex;justify-content:space-between;width:100%;gap:8px">
            <span class="label"><b>${m.name}</b></span>
            <span class="muted">${m.length} chars</span>
          </div>
          <span class="muted" style="font-size:12px">${(m.preview || '').replace(/</g,'&lt;')}…</span>
          <button type="button" class="btn ghost" data-method-load="${m.name.replace(/"/g, '&quot;')}">Edit</button>
        </div>`
      ).join('');
      el.querySelectorAll('[data-method-load]').forEach((btn) => {
        btn.onclick = async () => {
          const name = btn.getAttribute('data-method-load');
          document.getElementById('methodName').value = name;
          // fetch full text via list is preview only — re-get by saving name; use GET list has no full body
          // POST get not available — store preview; user can paste. Better: include body in GET for staff.
          const full = j.methods.find((x) => x.name === name);
          document.getElementById('methodBody').value = full?.body || full?.preview || '';
          document.getElementById('methodMsg').textContent = 'Loaded — edit and Save to update';
        };
      });
    }
  } catch (e) {
    document.getElementById('methodsOut').textContent = e.message;
  }
}


async function loadToggles() {
  try {
    const j = await api('/api/toggles');
    togglesCache = j;
    const prot = document.getElementById('protToggles');
    const feat = document.getElementById('featToggles');
    const quick = document.getElementById('quickToggles');
    prot.innerHTML = '';
    feat.innerHTML = '';
    quick.innerHTML = '';
    const p = j.protection || {};
    renderToggleRow(prot, 'Anti-nuke', 'antinuke', 'protection', p.antinuke);
    renderToggleRow(prot, 'Anti-betray', 'antibetray', 'protection', p.antibetray);
    renderToggleRow(prot, 'Automod', 'automod', 'protection', p.automod);
    renderToggleRow(prot, 'Anti-raid', 'antiraid', 'protection', p.antiraid);
    document.getElementById('badWords').value = p.badWords || '';
    const t = j.toggles || {};
    const features = [
      ['Staff apply open', 'staffApplyOpen'],
      ['AI replies', 'aiEnabled'],
      ['Hits system', 'hitsEnabled'],
      ['Giveaways', 'giveawaysEnabled'],
      ['Free gen', 'freeGenEnabled'],
      ['Paid gen', 'paidGenEnabled'],
      ['Claim rewards', 'claimEnabled'],
      ['Auto ticket cleanup', 'autoTicketCleanup']
    ];
    features.forEach(([label, key]) => {
      renderToggleRow(feat, label, key, 'toggles', t[key]);
      renderToggleRow(quick, label, key, 'toggles', t[key]);
    });
    const s = j.settings || {};
    document.getElementById('aiChannelId').value = s.aiChannelId || '';
    document.getElementById('autoExportMinutes').value = s.autoExportMinutes || 0;
    document.getElementById('autoExportChannelId').value = s.autoExportChannelId || '';
  } catch (e) {
    document.getElementById('setMsg').textContent = e.message;
  }
}

async function boot() {
  const s = await api('/api/status');
  if (!s.authed) {
    document.getElementById('gateErr').textContent = s.error || s.hint || '';
    return;
  }
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('meLine').textContent =
    (s.userTag || s.userId) + (s.online ? ' · bot online' : ' · bot…') +
    (s.guild?.name ? ' · ' + s.guild.name : '');
  const stats = document.getElementById('stats');
  stats.innerHTML = `
    <div class="stat"><b>${s.guild?.memberCount ?? '—'}</b><span>Members</span></div>
    <div class="stat"><b>${s.guild?.channels ?? '—'}</b><span>Channels</span></div>
    <div class="stat"><b>${s.online ? 'ON' : 'OFF'}</b><span>Bot</span></div>
  `;
  document.getElementById('staffChatId').textContent = STAFF_CHAT;
  document.getElementById('staffCmdId').textContent = STAFF_CMD;
  loadToggles();
}

document.getElementById('menuBtn').onclick = () =>
  document.getElementById('nav').classList.toggle('open');
document.getElementById('nav').onclick = (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) tab(b.dataset.tab);
};
document.getElementById('btnTickets').onclick = loadTickets;
document.getElementById('ticketSend').onclick = () => {
  if (!activeTicket) return alert('Select a ticket');
  sendTo(activeTicket, 'ticketInput', 'ticketChat');
};
document.getElementById('staffChatSend').onclick = () =>
  sendTo(STAFF_CHAT, 'staffChatInput', 'staffChatBox');
document.getElementById('staffCmdSend').onclick = () =>
  sendTo(STAFF_CMD, 'staffCmdInput', 'staffCmdBox');
document.getElementById('staffChatRefresh').onclick = () =>
  loadChannel(STAFF_CHAT, 'staffChatBox');
document.getElementById('staffCmdRefresh').onclick = () =>
  loadChannel(STAFF_CMD, 'staffCmdBox');
document.getElementById('btnStock').onclick = loadStock;
document.getElementById('btnSaveSettings').onclick = async () => {
  try {
    await api('/api/toggles', {
      method: 'POST',
      body: JSON.stringify({
        protection: { badWords: document.getElementById('badWords').value },
        settings: {
          aiChannelId: document.getElementById('aiChannelId').value.trim(),
          autoExportMinutes: Number(document.getElementById('autoExportMinutes').value || 0),
          autoExportChannelId: document.getElementById('autoExportChannelId').value.trim()
        }
      })
    });
    document.getElementById('setMsg').textContent = 'Saved ✓';
  } catch (e) {
    document.getElementById('setMsg').textContent = e.message;
  }
};
document.getElementById('btnBlur').onclick = () => {
  document.documentElement.style.setProperty('--blur', (document.getElementById('blur').value || 2) + 'px');
};
document.getElementById('btnExport').onclick = async () => {
  const r = await fetch('/api/export', { credentials: 'same-origin' });
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ultimate-full-export.json';
  a.click();
};
document.getElementById('btnImport').onclick = async () => {
  const f = document.getElementById('importFile').files[0];
  if (!f) return;
  try {
    const text = await f.text();
    await api('/api/import', { method: 'POST', body: text });
    document.getElementById('backupMsg').textContent = 'Imported ✓';
  } catch (e) {
    document.getElementById('backupMsg').textContent = e.message;
  }
};


document.getElementById('btnMethods')?.addEventListener('click', () => loadMethods());
document.getElementById('btnMethodSave')?.addEventListener('click', async () => {
  const name = document.getElementById('methodName').value.trim();
  const content = document.getElementById('methodBody').value.trim();
  const msg = document.getElementById('methodMsg');
  try {
    await api('/api/methods', {
      method: 'POST',
      body: JSON.stringify({ action: 'set', name, content })
    });
    msg.textContent = 'Saved ✓ (unlimited — never depletes)';
    loadMethods();
  } catch (e) {
    msg.textContent = e.message;
  }
});
document.getElementById('btnMethodDelete')?.addEventListener('click', async () => {
  const name = document.getElementById('methodName').value.trim();
  const msg = document.getElementById('methodMsg');
  if (!name || !confirm('Delete method text for ' + name + '?')) return;
  try {
    await api('/api/methods', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', name })
    });
    msg.textContent = 'Deleted';
    document.getElementById('methodBody').value = '';
    loadMethods();
  } catch (e) {
    msg.textContent = e.message;
  }
});

boot().catch((e) => {
  document.getElementById('gateErr').textContent = e.message || '';
});
