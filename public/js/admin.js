/* Repair queue admin panel. */

const STATUSES = ['open', 'claimed', 'in_progress', 'done', 'unable', 'picked_up'];
let TOKEN = localStorage.getItem('rz-admin-token') || '';
let REPAIRS = [];
let FILTER = 'active';
let timer = null;
let editingId = null;

/* ── auth gate ── */
async function boot() {
  // Always try a ping first (token may be empty). If the server gates admin
  // upstream (.htaccess/proxy), this succeeds with no token and we skip the gate.
  try {
    await RZ.api('/api/admin/ping', { token: TOKEN });
    return showPanel();
  } catch {
    if (TOKEN) {
      TOKEN = '';
      localStorage.removeItem('rz-admin-token');
    }
    showGate();
  }
}

function showGate() {
  RZ.el('gate').style.display = '';
  RZ.el('panel').style.display = 'none';
  RZ.el('logout').style.display = 'none';
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
    const [{ repairs }, { stats }] = await Promise.all([
      RZ.api('/api/admin/repairs', { token: TOKEN }),
      RZ.api('/api/admin/ping', { token: TOKEN }),
    ]);
    REPAIRS = repairs;
    renderStats(stats);
    render();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

function renderStats(s) {
  RZ.el('stats').innerHTML = `
    <div class="stat"><div class="n">${s.repairs.total}</div><div class="l">Total requests</div></div>
    <div class="stat"><div class="n" style="color:var(--orange-600)">${s.repairs.open}</div><div class="l">In the queue</div></div>
    <div class="stat"><div class="n" style="color:var(--green)">${s.repairs.done}</div><div class="l">Completed</div></div>
    <div class="stat"><div class="n" style="color:var(--teal)">${s.rentals.out}</div><div class="l">Tools out</div></div>`;
}

function matchesFilter(r) {
  if (FILTER === 'all') return true;
  if (FILTER === 'active') return ['open', 'claimed', 'in_progress'].includes(r.status);
  if (FILTER === 'done') return ['done', 'picked_up', 'unable'].includes(r.status);
  return r.status === FILTER;
}

function render() {
  const q = RZ.el('search').value.trim().toLowerCase();
  const rows = REPAIRS.filter(matchesFilter).filter(
    (r) => !q || `${r.name} ${r.item} ${r.boothId} ${r.issue}`.toLowerCase().includes(q),
  );
  const body = RZ.el('rows');
  if (!rows.length) return (body.innerHTML = '<tr><td colspan="8" class="muted">Nothing here.</td></tr>');

  body.innerHTML = rows
    .map((r) => {
      const opts = STATUSES.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${RZ.statusLabel(s)}</option>`).join('');
      const thread = r.discord?.threadId ? ` <span class="muted mono">· post</span>` : '';
      const tm = RZ.typeMeta(r.type);
      const contact = [r.phone, r.contact].filter(Boolean).map(RZ.esc).join('<br>') || '<span class="muted">—</span>';
      return `<tr>
        <td class="mono">#${r.id}</td>
        <td><span title="${RZ.esc(tm.l)}">${tm.e}</span> <strong>${RZ.esc(r.item)}</strong>${thread}<br><span class="muted">${RZ.esc((r.issue || '').slice(0, 80))}${r.issue && r.issue.length > 80 ? '…' : ''}</span></td>
        <td>${RZ.esc(r.name)}${r.boothId ? `<br><span class="muted">${RZ.esc(r.boothId)}</span>` : ''}</td>
        <td>${contact}</td>
        <td><select onchange="setStatus(${r.id}, this.value)" data-status>${opts}</select></td>
        <td>${r.assignee ? `<span class="mono">${RZ.esc(r.assignee)}</span>` : '<button class="btn btn-ghost btn-sm" onclick="claim(' + r.id + ')">Claim</button>'}</td>
        <td class="muted" title="${RZ.esc(r.createdAt)}">${RZ.timeAgo(r.createdAt)}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="openModal(${r.id})">⋯</button></td>
      </tr>`;
    })
    .join('');

  // color the status selects
  body.querySelectorAll('select[data-status]').forEach((sel) => {
    sel.style.fontWeight = '700';
  });
}

/* ── actions ── */
async function setStatus(id, status) {
  try {
    await RZ.api(`/api/admin/repairs/${id}`, { method: 'PATCH', token: TOKEN, body: { status } });
    const r = REPAIRS.find((x) => x.id === id);
    if (r) r.status = status;
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

async function claim(id) {
  const who = prompt('Claim as (your name or Discord handle):');
  if (!who) return;
  try {
    await RZ.api(`/api/admin/repairs/${id}`, { method: 'PATCH', token: TOKEN, body: { assignee: who, status: 'claimed' } });
    load();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

function openModal(id) {
  const r = REPAIRS.find((x) => x.id === id);
  if (!r) return;
  editingId = id;
  RZ.el('modal-title').textContent = `Repair #${r.id} — ${r.item}`;
  RZ.el('modal-body').innerHTML = `
    <p style="margin:.2rem 0"><strong>Requester:</strong> ${RZ.esc(r.name)} ${r.boothId ? '· ' + RZ.esc(r.boothId) : ''}</p>
    <p style="margin:.2rem 0"><strong>Contact:</strong> ${RZ.esc(r.phone || '')} ${RZ.esc(r.contact || '')}</p>
    <p style="margin:.2rem 0"><strong>Status:</strong> ${RZ.pill(r.status)}</p>
    <p style="margin:.6rem 0"><strong>Issue:</strong><br>${RZ.esc(r.issue || '—')}</p>
    ${r.discord?.threadId ? `<p class="muted mono">Discord thread: ${RZ.esc(r.discord.threadId)}</p>` : ''}`;
  RZ.el('modal-notes').value = r.notes || '';
  RZ.el('modal').classList.add('show');
}
function closeModal() {
  RZ.el('modal').classList.remove('show');
  editingId = null;
}
RZ.el('modal-save').addEventListener('click', async () => {
  if (!editingId) return;
  try {
    await RZ.api(`/api/admin/repairs/${editingId}`, { method: 'PATCH', token: TOKEN, body: { notes: RZ.el('modal-notes').value } });
    closeModal();
    load();
  } catch (err) {
    alert(err.message);
  }
});
RZ.el('modal').addEventListener('click', (e) => e.target.id === 'modal' && closeModal());

/* ── filters / search / autorefresh ── */
RZ.el('filters').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  FILTER = e.target.dataset.f;
  RZ.el('filters').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
  render();
});
RZ.el('search').addEventListener('input', render);
RZ.el('autorefresh').addEventListener('change', (e) => {
  clearInterval(timer);
  if (e.target.checked) timer = setInterval(load, 10000);
});

window.setStatus = setStatus;
window.claim = claim;
window.openModal = openModal;
window.closeModal = closeModal;
window.load = load;

boot();
