/* Borrowing admin panel. Tool inventory is shelved (no asset-management system
 * yet) — this view tracks free-text checkouts only: what's currently loaned out,
 * above the full rental log. */

let TOKEN = localStorage.getItem('rz-admin-token') || '';
let RENTALS = [];
let timer = null;
let lastSig = '';

/* ── auth ── */
async function boot() {
  try {
    await RZ.api('/api/admin/ping', { token: TOKEN });
    return showPanel();
  } catch {
    if (TOKEN) {
      TOKEN = '';
      localStorage.removeItem('rz-admin-token');
    }
    RZ.el('gate').style.display = '';
  }
}
function showPanel() {
  RZ.el('gate').style.display = 'none';
  RZ.el('panel').style.display = '';
  RZ.el('logout').style.display = '';
  load();
  startSync();
}
RZ.el('gate-btn').addEventListener('click', signIn);
RZ.el('token').addEventListener('keydown', (e) => e.key === 'Enter' && signIn());
async function signIn() {
  const t = RZ.el('token').value.trim();
  if (!t) return;
  try {
    await RZ.api('/api/admin/ping', { token: t });
    TOKEN = t;
    localStorage.setItem('rz-admin-token', t);
    showPanel();
  } catch (err) {
    RZ.notice(RZ.el('gate-notice'), 'error', err.message);
  }
}
RZ.el('logout').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('rz-admin-token');
  location.reload();
});

/* ── data ── */
async function load({ silent = false } = {}) {
  try {
    const [{ rentals }, { stats }] = await Promise.all([
      RZ.api('/api/admin/rentals', { token: TOKEN }),
      RZ.api('/api/admin/ping', { token: TOKEN }),
    ]);
    // On background polls, skip re-rendering when nothing changed.
    const sig = JSON.stringify({ rentals, stats });
    if (silent && sig === lastSig) return;
    lastSig = sig;
    RENTALS = rentals;
    renderStats(stats);
    renderActive();
    renderRentals();
  } catch (err) {
    if (!silent) RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

// Poll so checkouts/returns by other staff show up automatically for everyone
// with the page open. Pauses while the tab is hidden.
function startSync() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!document.hidden) load({ silent: true });
  }, 5000);
}

function renderStats(s) {
  RZ.el('stats').innerHTML = `
    <div class="stat"><div class="n" style="color:var(--red)">${s.rentals.out}</div><div class="l">Checked out now</div></div>
    <div class="stat"><div class="n" style="color:var(--green)">${s.rentals.returned}</div><div class="l">Returned</div></div>
    <div class="stat"><div class="n">${s.rentals.total}</div><div class="l">Total checkouts</div></div>`;
}

function searchQuery() {
  const el = RZ.el('search');
  return el ? el.value.trim().toLowerCase() : '';
}

function matchesSearch(r, q) {
  return !q || `${r.toolName} ${r.name} ${r.boothId || ''} ${r.phone || ''} ${r.notes || ''}`.toLowerCase().includes(q);
}

// Accumulated notes shown as a muted sub-line under the tool name.
function notesLine(r) {
  return r.notes ? `<br><span class="muted" style="white-space:pre-wrap;font-size:.85rem;">${RZ.esc(r.notes)}</span>` : '';
}

// Currently loaned out: the active checkouts, surfaced above the full log so
// staff can see what's still in someone's hands at a glance.
function renderActive() {
  const q = searchQuery();
  const body = RZ.el('active');
  const list = RENTALS.filter((r) => r.status === 'out').filter((r) => matchesSearch(r, q));
  if (!list.length) return (body.innerHTML = `<tr><td colspan="6" class="muted">${RENTALS.some((r) => r.status === 'out') ? 'None match your search.' : 'Nothing checked out right now.'}</td></tr>`);
  body.innerHTML = list
    .map(
      (r) => `<tr>
      <td><strong>${RZ.esc(r.toolName)}</strong>${notesLine(r)}</td>
      <td>${RZ.esc(r.name)}</td>
      <td class="muted">${RZ.esc(r.boothId || '—')}</td>
      <td class="muted">${RZ.esc(r.phone || '—')}</td>
      <td class="muted">${RZ.time(r.timeOut)}</td>
      <td style="display:flex;gap:6px;"><button class="btn btn-primary btn-sm" onclick="returnRental(${r.id})">Check in</button><button class="btn btn-ghost btn-sm" onclick="addNote(${r.id})" title="Add a note">Note</button></td>
    </tr>`,
    )
    .join('');
}

function renderRentals() {
  const q = searchQuery();
  const body = RZ.el('rentals');
  const list = RENTALS.filter((r) => matchesSearch(r, q));
  if (!list.length) return (body.innerHTML = `<tr><td colspan="8" class="muted">${RENTALS.length ? 'No rentals match your search.' : 'No rentals yet.'}</td></tr>`);
  body.innerHTML = list
    .map(
      (r) => `<tr>
      <td class="mono">#${r.id}</td>
      <td>${RZ.esc(r.toolName)}${notesLine(r)}</td>
      <td>${RZ.esc(r.name)}</td>
      <td class="muted">${RZ.esc(r.boothId || '—')}</td>
      <td class="muted">${RZ.esc(r.phone || '—')}</td>
      <td class="muted">${RZ.time(r.timeOut)}</td>
      <td class="muted">${r.timeIn ? RZ.time(r.timeIn) : '—'}</td>
      <td>${r.status === 'out' ? RZ.pill('out') + ` <button class="btn btn-primary btn-sm" onclick="returnRental(${r.id})">In</button>` : '<span class="pill available">Returned</span> <button class="btn btn-ghost btn-sm" onclick="reopenRental(' + r.id + ')" title="Undo check-in — mark as out again">Undo</button>'} <button class="btn btn-ghost btn-sm" onclick="addNote(${r.id})" title="Add a note">Note</button></td>
    </tr>`,
    )
    .join('');
}

/* ── actions ── */
async function returnRental(id) {
  try {
    await RZ.api(`/api/admin/rentals/${id}/return`, { method: 'PATCH', token: TOKEN });
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}
// Undo an accidental check-in: flip a returned rental back to "out".
async function reopenRental(id) {
  try {
    await RZ.api(`/api/admin/rentals/${id}/reopen`, { method: 'PATCH', token: TOKEN });
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}
// Append a note to a rental's running log.
async function addNote(id) {
  const note = prompt('Add a note to this rental:');
  if (!note || !note.trim()) return;
  try {
    await RZ.api(`/api/admin/rentals/${id}/notes`, { method: 'POST', token: TOKEN, body: { note } });
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

/* ── checkout modal (free-text — no inventory record needed) ── */
function openCheckout() {
  RZ.el('checkout-notice').className = 'notice';
  ['co-tool', 'co-name', 'co-booth', 'co-phone'].forEach((id) => (RZ.el(id).value = ''));
  RZ.el('checkout-modal').classList.add('show');
  RZ.el('co-tool').focus();
}
RZ.el('co-save').addEventListener('click', async () => {
  const toolName = RZ.el('co-tool').value.trim();
  const name = RZ.el('co-name').value.trim();
  if (!toolName || !name) return RZ.notice(RZ.el('checkout-notice'), 'error', 'Tool and borrower name are required.');
  const body = { toolName, name, boothId: RZ.el('co-booth').value.trim(), phone: RZ.el('co-phone').value.trim() };
  try {
    await RZ.api('/api/admin/rentals', { method: 'POST', token: TOKEN, body });
    closeModals();
    load();
  } catch (err) {
    RZ.notice(RZ.el('checkout-notice'), 'error', err.message);
  }
});

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.remove('show'));
}
document.querySelectorAll('.modal-backdrop').forEach((m) => m.addEventListener('click', (e) => e.target === m && closeModals()));

RZ.el('search').addEventListener('input', () => {
  renderActive();
  renderRentals();
});

window.returnRental = returnRental;
window.reopenRental = reopenRental;
window.addNote = addNote;
window.openCheckout = openCheckout;
window.closeModals = closeModals;
window.load = load;

boot();
