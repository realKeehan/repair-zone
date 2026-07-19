/* Borrowing & inventory admin panel. */

const TOOL_STATUSES = ['available', 'out', 'maintenance'];
let TOKEN = localStorage.getItem('rz-admin-token') || '';
let TOOLS = [];
let RENTALS = [];

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
async function load() {
  try {
    const [{ tools }, { rentals }, { stats }] = await Promise.all([
      RZ.api('/api/admin/tools', { token: TOKEN }),
      RZ.api('/api/admin/rentals', { token: TOKEN }),
      RZ.api('/api/admin/ping', { token: TOKEN }),
    ]);
    TOOLS = tools;
    RENTALS = rentals;
    renderStats(stats);
    renderTools();
    renderRentals();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

function renderStats(s) {
  // Lead with rental activity (works for free-text checkouts); inventory count
  // is just a reference and is 0 unless staff have added tools manually.
  RZ.el('stats').innerHTML = `
    <div class="stat"><div class="n" style="color:var(--red)">${s.rentals.out}</div><div class="l">Checked out now</div></div>
    <div class="stat"><div class="n" style="color:var(--green)">${s.rentals.returned}</div><div class="l">Returned</div></div>
    <div class="stat"><div class="n">${s.rentals.total}</div><div class="l">Total checkouts</div></div>
    <div class="stat"><div class="n">${s.tools.total}</div><div class="l">Tools in inventory</div></div>`;
}

function searchQuery() {
  const el = RZ.el('search');
  return el ? el.value.trim().toLowerCase() : '';
}

function renderTools() {
  const q = searchQuery();
  const body = RZ.el('tools');
  const list = TOOLS.filter((t) => !q || `${t.name} ${t.category} ${t.borrowerName || ''} ${t.borrowerBooth || ''}`.toLowerCase().includes(q));
  if (!list.length) return (body.innerHTML = `<tr><td colspan="6" class="muted">${TOOLS.length ? 'No tools match your search.' : 'No tools.'}</td></tr>`);
  body.innerHTML = list.map((t) => {
    const opts = TOOL_STATUSES.map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${RZ.statusLabel(s)}</option>`).join('');
    const action =
      t.status === 'out' && t.rentalId
        ? `<button class="btn btn-primary btn-sm" onclick="returnRental(${t.rentalId})">Check in</button>`
        : t.status === 'available'
        ? `<button class="btn btn-ghost btn-sm" onclick="quickCheckout(${t.id})">Check out</button>`
        : '';
    return `<tr>
      <td><strong>${RZ.esc(t.name)}</strong>${t.requiresTraining ? ' <span class="muted">· training</span>' : ''}</td>
      <td class="muted">${RZ.esc(t.category)}</td>
      <td><select onchange="setToolStatus(${t.id}, this.value)" style="font-weight:700">${opts}</select></td>
      <td>${t.borrowerName ? RZ.esc(t.borrowerName) + (t.borrowerBooth ? `<br><span class="muted">${RZ.esc(t.borrowerBooth)}</span>` : '') : '<span class="muted">—</span>'}</td>
      <td class="muted">${t.checkedOutAt ? RZ.time(t.checkedOutAt) : '—'}</td>
      <td style="display:flex;gap:6px;">${action}<button class="btn btn-danger btn-sm" onclick="deleteTool(${t.id})" title="Remove">✕</button></td>
    </tr>`;
  }).join('');
}

function renderRentals() {
  const q = searchQuery();
  const body = RZ.el('rentals');
  const list = RENTALS.filter((r) => !q || `${r.toolName} ${r.name} ${r.boothId || ''} ${r.phone || ''}`.toLowerCase().includes(q));
  if (!list.length) return (body.innerHTML = `<tr><td colspan="8" class="muted">${RENTALS.length ? 'No rentals match your search.' : 'No rentals yet.'}</td></tr>`);
  body.innerHTML = list.map(
    (r) => `<tr>
      <td class="mono">#${r.id}</td>
      <td>${RZ.esc(r.toolName)}</td>
      <td>${RZ.esc(r.name)}</td>
      <td class="muted">${RZ.esc(r.boothId || '—')}</td>
      <td class="muted">${RZ.esc(r.phone || '—')}</td>
      <td class="muted">${RZ.time(r.timeOut)}</td>
      <td class="muted">${r.timeIn ? RZ.time(r.timeIn) : '—'}</td>
      <td>${r.status === 'out' ? RZ.pill('out') + ` <button class="btn btn-primary btn-sm" onclick="returnRental(${r.id})">In</button>` : '<span class="pill available">Returned</span>'}</td>
    </tr>`,
  ).join('');
}

/* ── actions ── */
async function setToolStatus(id, status) {
  try {
    await RZ.api(`/api/admin/tools/${id}`, { method: 'PATCH', token: TOKEN, body: { status } });
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}
async function returnRental(id) {
  try {
    await RZ.api(`/api/admin/rentals/${id}/return`, { method: 'PATCH', token: TOKEN });
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}
async function deleteTool(id) {
  if (!confirm('Remove this tool from inventory?')) return;
  try {
    await RZ.api(`/api/admin/tools/${id}`, { method: 'DELETE', token: TOKEN });
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

/* ── checkout modal ── */
// When checking out an existing inventory tool we keep its id so its status
// flips to "out"; a blank id means a free-text checkout (just logs the name).
let checkoutToolId = null;
function openCheckout(tool) {
  checkoutToolId = tool && tool.id ? tool.id : null;
  RZ.el('co-tool').value = tool && tool.name ? tool.name : '';
  RZ.el('checkout-notice').className = 'notice';
  ['co-name', 'co-booth', 'co-phone'].forEach((id) => (RZ.el(id).value = ''));
  RZ.el('checkout-modal').classList.add('show');
  RZ.el('co-tool').focus();
}
function quickCheckout(id) {
  openCheckout(TOOLS.find((t) => t.id === id) || null);
}
RZ.el('co-save').addEventListener('click', async () => {
  const toolName = RZ.el('co-tool').value.trim();
  const name = RZ.el('co-name').value.trim();
  if (!toolName || !name) return RZ.notice(RZ.el('checkout-notice'), 'error', 'Tool and borrower name are required.');
  const body = { name, boothId: RZ.el('co-booth').value.trim(), phone: RZ.el('co-phone').value.trim() };
  if (checkoutToolId) body.toolId = checkoutToolId;
  else body.toolName = toolName;
  try {
    await RZ.api('/api/admin/rentals', { method: 'POST', token: TOKEN, body });
    closeModals();
    load();
  } catch (err) {
    RZ.notice(RZ.el('checkout-notice'), 'error', err.message);
  }
});

/* ── add tool modal ── */
function openAddTool() {
  RZ.el('addtool-notice').className = 'notice';
  ['at-name', 'at-cat'].forEach((id) => (RZ.el(id).value = ''));
  RZ.el('at-train').checked = false;
  RZ.el('addtool-modal').classList.add('show');
}
RZ.el('at-save').addEventListener('click', async () => {
  const body = { name: RZ.el('at-name').value.trim(), category: RZ.el('at-cat').value.trim(), requiresTraining: RZ.el('at-train').checked };
  if (!body.name) return RZ.notice(RZ.el('addtool-notice'), 'error', 'Tool name is required.');
  try {
    await RZ.api('/api/admin/tools', { method: 'POST', token: TOKEN, body });
    closeModals();
    load();
  } catch (err) {
    RZ.notice(RZ.el('addtool-notice'), 'error', err.message);
  }
});

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.remove('show'));
}
document.querySelectorAll('.modal-backdrop').forEach((m) => m.addEventListener('click', (e) => e.target === m && closeModals()));

RZ.el('search').addEventListener('input', () => {
  renderTools();
  renderRentals();
});

window.setToolStatus = setToolStatus;
window.returnRental = returnRental;
window.deleteTool = deleteTool;
window.openCheckout = openCheckout;
window.quickCheckout = quickCheckout;
window.openAddTool = openAddTool;
window.closeModals = closeModals;
window.load = load;

boot();
