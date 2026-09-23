const STAFF_CHAT = '1547183225317883954';
const STAFF_CMD = '1547183226827702312';

let activeTicket = null;
let togglesCache = null;

function productTheme(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('robux') || n.includes('roblox')) return 'theme-roblox';
  if (n.includes('hypixel')) return 'theme-hypixel';
  if (n.includes('minecraft') || n.includes('mc redeem') || n === 'mcfa' || n.includes('mcfa')) return 'theme-minecraft';
  if (n.includes('nitro')) return 'theme-nitro';
  if (n.includes('netflix')) return 'theme-netflix';
  if (n.includes('crunchy')) return 'theme-crunchy';
  if (n.includes('xbox')) return 'theme-xbox';
  if (n.includes('amazon') || n.includes('prime')) return 'theme-amazon';
  if (n.includes('stream') || n.includes('twitch') || n.includes('steam')) return 'theme-stream';
  if (n.includes('hotmail') || n.includes('outlook')) return 'theme-hotmail';
  if (n.includes('boost')) return 'theme-boost';
  if (n.includes('hosting') || n.includes('website')) return 'theme-hosting';
  if (n.includes('custom') || n.includes('donut')) return 'theme-custom';
  return 'theme-default';
}

function productImage(name) {
  const n = String(name || '').toLowerCase();
  // Free Unsplash photos (not official logos)
  if (n.includes('robux') || n.includes('roblox'))
    return 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&q=80';
  if (n.includes('hypixel') || n.includes('minecraft') || n.includes('mcfa') || n.includes('mc redeem'))
    return 'https://images.unsplash.com/photo-1587573089734-07cbd78fa4a0?w=400&q=80';
  if (n.includes('nitro') || n.includes('boost') || n.includes('discord'))
    return 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&q=80';
  if (n.includes('netflix') || n.includes('stream') || n.includes('crunchy'))
    return 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&q=80';
  if (n.includes('xbox') || n.includes('game') || n.includes('steam'))
    return 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&q=80';
  if (n.includes('amazon') || n.includes('prime'))
    return 'https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?w=400&q=80';
  if (n.includes('hosting') || n.includes('website'))
    return 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&q=80';
  return 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80';
}


let selectedMethodName = null;
let selectedStockProduct = null;



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

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarBackdrop')?.classList.add('open');
}

function tab(name) {
  document.querySelectorAll('[id^=tab-]').forEach((e) => e.classList.add('hidden'));
  document.getElementById('tab-' + name)?.classList.remove('hidden');
  document.querySelectorAll('#nav button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  closeSidebar();
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
    const stocks = j.stocks || j || {};
    const grid = document.getElementById('stockCards');
    if (!grid) return;
    const entries = Object.entries(stocks);
    if (!entries.length) {
      grid.innerHTML = '<p class="muted">No products configured</p>';
      return;
    }
    grid.innerHTML = entries.map(([k, v]) => {
      const n = typeof v === 'object' ? (v.count ?? v.length ?? 0) : v;
      const theme = productTheme(k);
      const label = k.toUpperCase();
      const img = productImage(k);
      return `<div class="product-card ${theme}" data-stock="${k}" style="background-image:linear-gradient(180deg,transparent 25%,rgba(0,0,0,.88)),url('${img}')">
        <span class="pc-badge">${n} left</span>
        <div class="pc-name">${label}</div>
        <div class="pc-meta">Tap to add stock</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('[data-stock]').forEach((el) => {
      el.onclick = () => {
        grid.querySelectorAll('.product-card').forEach((c) => c.classList.remove('selected'));
        el.classList.add('selected');
        selectedStockProduct = el.getAttribute('data-stock');
        const ed = document.getElementById('stockEditor');
        ed.classList.remove('hidden');
        document.getElementById('stockEditorTitle').textContent = 'Add stock · ' + selectedStockProduct.toUpperCase();
        document.getElementById('stockLines').value = '';
        document.getElementById('stockMsg').textContent = '';
      };
    });
  } catch (e) {
    const grid = document.getElementById('stockCards');
    if (grid) grid.innerHTML = `<p class="muted">${e.message}</p>`;
  }
}

async function loadMethods() {
  try {
    const j = await api('/api/methods');
    const tiers = document.getElementById('rewardTiersOut');
    if (tiers) {
      const inv = (j.inviteRewards || []).map((r) =>
        `<div class="toggle"><span class="label">${r.invites} inv · ${r.type}</span><b>${r.name}</b></div>`
      ).join('');
      const msg = (j.messageRewards || []).map((r) =>
        `<div class="toggle"><span class="label">${r.messages} msgs</span><b>${r.name}</b></div>`
      ).join('');
      tiers.innerHTML =
        '<p class="muted" style="margin:0 0 6px">Invite rewards</p>' + (inv || '<p class="muted">—</p>') +
        '<p class="muted" style="margin:12px 0 6px">Message milestones</p>' + (msg || '<p class="muted">—</p>');
    }

    const names = new Set([
      ...(j.catalog || []),
      ...(j.inviteRewards || []).filter((r) => r.type === 'method').map((r) => r.name),
      ...(j.messageRewards || []).map((r) => r.name),
      ...(j.methods || []).map((m) => m.name)
    ]);
    const saved = Object.fromEntries((j.methods || []).map((m) => [m.name, m]));

    const grid = document.getElementById('methodCards');
    if (!grid) return;
    const list = [...names];
    if (!list.length) {
      grid.innerHTML = '<p class="muted">No method rewards in catalog</p>';
      return;
    }
    grid.innerHTML = list.map((name) => {
      const has = !!saved[name]?.body || !!saved[name]?.length;
      const len = saved[name]?.length || 0;
      const theme = productTheme(name);
      const img = productImage(name);
      return `<div class="product-card ${theme}" data-method="${name.replace(/"/g, '&quot;')}" style="background-image:linear-gradient(180deg,transparent 25%,rgba(0,0,0,.88)),url('${img}')">
        <span class="pc-badge">${has ? len + ' chars' : 'Empty'}</span>
        <div class="pc-name">${name}</div>
        <div class="pc-meta">${has ? 'Tap to edit' : 'Tap to add text'}</div>
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-method]').forEach((el) => {
      el.onclick = () => {
        grid.querySelectorAll('.product-card').forEach((c) => c.classList.remove('selected'));
        el.classList.add('selected');
        selectedMethodName = el.getAttribute('data-method');
        const full = (j.methods || []).find((x) => x.name === selectedMethodName);
        document.getElementById('methodEditor').classList.remove('hidden');
        document.getElementById('methodEditorTitle').textContent = selectedMethodName;
        document.getElementById('methodBody').value = full?.body || '';
        document.getElementById('methodMsg').textContent = full?.body ? 'Loaded — edit & save' : 'No text yet — paste method & save';
      };
    });
  } catch (e) {
    const grid = document.getElementById('methodCards');
    if (grid) grid.innerHTML = `<p class="muted">${e.message}</p>`;
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
  document.documentElement.style.setProperty('--blur', '0.5px');
  const blurInput = document.getElementById('blur');
  if (blurInput) blurInput.value = '0.5';

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
  document.documentElement.style.setProperty('--blur', (document.getElementById('blur').value || 0.5) + 'px');
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
  const name = selectedMethodName || document.getElementById('methodEditorTitle')?.textContent?.trim();
  const content = document.getElementById('methodBody').value.trim();
  const msg = document.getElementById('methodMsg');
  if (!name) { msg.textContent = 'Select a method card first'; return; }
  try {
    await api('/api/methods', {
      method: 'POST',
      body: JSON.stringify({ action: 'set', name, content })
    });
    msg.textContent = 'Saved ✓ unlimited';
    loadMethods();
  } catch (e) {
    msg.textContent = e.message;
  }
});
document.getElementById('btnMethodDelete')?.addEventListener('click', async () => {
  const name = selectedMethodName;
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
document.getElementById('btnMethodCancel')?.addEventListener('click', () => {
  document.getElementById('methodEditor')?.classList.add('hidden');
});
document.getElementById('btnStockAdd')?.addEventListener('click', async () => {
  const product = selectedStockProduct;
  const lines = document.getElementById('stockLines').value;
  const msg = document.getElementById('stockMsg');
  if (!product) { msg.textContent = 'Select a product card first'; return; }
  try {
    const j = await api('/api/stock', {
      method: 'POST',
      body: JSON.stringify({ product, lines })
    });
    msg.textContent = 'Added ' + (j.added || 0) + ' · total ' + (j.total || '?');
    document.getElementById('stockLines').value = '';
    loadStock();
  } catch (e) {
    msg.textContent = e.message;
  }
});
document.getElementById('btnStockCancel')?.addEventListener('click', () => {
  document.getElementById('stockEditor')?.classList.add('hidden');
});


document.getElementById('menuBtn')?.addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  if (sb?.classList.contains('open')) closeSidebar();
  else openSidebar();
});
document.getElementById('sidebarBackdrop')?.addEventListener('click', closeSidebar);


document.getElementById('featureHub')?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-goto]');
  if (card) tab(card.getAttribute('data-goto'));
});


// Delegated clicks (more reliable on mobile)
document.getElementById('stockCards')?.addEventListener('click', (e) => {
  const el = e.target.closest('[data-stock]');
  if (!el) return;
  document.querySelectorAll('#stockCards .product-card').forEach((c) => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedStockProduct = el.getAttribute('data-stock');
  const ed = document.getElementById('stockEditor');
  if (ed) {
    ed.classList.remove('hidden');
    document.getElementById('stockEditorTitle').textContent = 'Add stock · ' + selectedStockProduct.toUpperCase();
    document.getElementById('stockLines').value = '';
    document.getElementById('stockMsg').textContent = 'Selected ' + selectedStockProduct;
  }
});
document.getElementById('methodCards')?.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-method]');
  if (!el) return;
  document.querySelectorAll('#methodCards .product-card').forEach((c) => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedMethodName = el.getAttribute('data-method');
  const ed = document.getElementById('methodEditor');
  if (ed) ed.classList.remove('hidden');
  document.getElementById('methodEditorTitle').textContent = selectedMethodName;
  document.getElementById('methodMsg').textContent = 'Loading…';
  try {
    const j = await api('/api/methods');
    const full = (j.methods || []).find((x) => x.name === selectedMethodName);
    document.getElementById('methodBody').value = full?.body || '';
    document.getElementById('methodMsg').textContent = full?.body ? 'Loaded' : 'Empty — paste method text & Save';
  } catch (err) {
    document.getElementById('methodMsg').textContent = err.message;
  }
});

boot().catch((e) => {
  document.getElementById('gateErr').textContent = e.message || '';
});
