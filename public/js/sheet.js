/* Overview "spreadsheet" with Requests / Rentals / Inventory tabs + CSV export. */

let TOKEN = localStorage.getItem('rz-admin-token') || '';
let TAB = 'requests';
let DATA = { requests: [], rentals: [], inventory: [] };

/* ── column definitions per tab ── */
const COLUMNS = {
  requests: [
    { key: 'id', label: '#', get: (r) => '#' + r.id },
    { key: 'type', label: 'Type', get: (r) => `${RZ.typeMeta(r.type).e} ${RZ.typeMeta(r.type).l}` },
    { key: 'item', label: 'Item', get: (r) => r.item },
    { key: 'issue', label: 'Request / issue', get: (r) => r.issue, wrap: true },
    { key: 'name', label: 'Requester', get: (r) => r.name },
    { key: 'boothId', label: 'Booth', get: (r) => r.boothId },
    { key: 'phone', label: 'Phone', get: (r) => r.phone },
    { key: 'contact', label: 'Contact', get: (r) => r.contact },
    { key: 'status', label: 'Status', get: (r) => r.status, pill: true },
    { key: 'assignee', label: 'Owner', get: (r) => r.assignee || '' },
    { key: 'source', label: 'Source', get: (r) => r.source },
    { key: 'createdAt', label: 'Created', get: (r) => r.createdAt, time: true },
    { key: 'updatedAt', label: 'Updated', get: (r) => r.updatedAt, time: true },
  ],
  rentals: [
    { key: 'id', label: '#', get: (r) => '#' + r.id },
    { key: 'toolName', label: 'Tool', get: (r) => r.toolName },
    { key: 'name', label: 'Borrower', get: (r) => r.name },
    { key: 'boothId', label: 'Booth', get: (r) => r.boothId },
    { key: 'phone', label: 'Phone', get: (r) => r.phone },
    { key: 'timeOut', label: 'Time out', get: (r) => r.timeOut, time: true },
    { key: 'timeIn', label: 'Time in', get: (r) => r.timeIn, time: true },
    { key: 'status', label: 'Status', get: (r) => r.status, pill: true },
  ],
  inventory: [
    { key: 'id', label: '#', get: (t) => '#' + t.id },
    { key: 'name', label: 'Tool', get: (t) => t.name },
    { key: 'category', label: 'Category', get: (t) => t.category },
    { key: 'status', label: 'Status', get: (t) => t.status, pill: true },
    { key: 'borrowerName', label: 'Borrower', get: (t) => t.borrowerName || '' },
    { key: 'borrowerBooth', label: 'Booth', get: (t) => t.borrowerBooth || '' },
    { key: 'checkedOutAt', label: 'Out since', get: (t) => t.checkedOutAt, time: true },
    { key: 'requiresTraining', label: 'Training?', get: (t) => (t.requiresTraining ? 'yes' : '') },
  ],
};

/* ── auth ── */
async function boot() {
  if (TOKEN) {
    try {
      await RZ.api('/api/admin/ping', { token: TOKEN });
      return showPanel();
    } catch {
      TOKEN = '';
      localStorage.removeItem('rz-admin-token');
    }
  }
  RZ.el('gate').style.display = '';
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
    const [{ repairs }, { rentals }, { tools }, { stats }] = await Promise.all([
      RZ.api('/api/admin/repairs', { token: TOKEN }),
      RZ.api('/api/admin/rentals', { token: TOKEN }),
      RZ.api('/api/admin/tools', { token: TOKEN }),
      RZ.api('/api/admin/ping', { token: TOKEN }),
    ]);
    DATA = { requests: repairs, rentals, inventory: tools };
    renderStats(stats);
    render();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', err.message);
  }
}

function renderStats(s) {
  RZ.el('stats').innerHTML = `
    <div class="stat"><div class="n">${s.repairs.total}</div><div class="l">Requests</div></div>
    <div class="stat"><div class="n" style="color:var(--orange-600)">${s.repairs.open}</div><div class="l">In queue</div></div>
    <div class="stat"><div class="n" style="color:var(--teal)">${s.tools.out}/${s.tools.total}</div><div class="l">Tools out</div></div>
    <div class="stat"><div class="n" style="color:var(--green)">${s.repairs.done}</div><div class="l">Completed</div></div>`;
}

function rows() {
  const q = RZ.el('search').value.trim().toLowerCase();
  const list = DATA[TAB] || [];
  if (!q) return list;
  return list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
}

function render() {
  const cols = COLUMNS[TAB];
  RZ.el('thead').innerHTML = '<tr>' + cols.map((c) => `<th>${RZ.esc(c.label)}</th>`).join('') + '</tr>';
  const list = rows();
  RZ.el('tbody').innerHTML = list.length
    ? list
        .map(
          (r) =>
            '<tr>' +
            cols
              .map((c) => {
                let v = c.get(r);
                if (c.time) v = v ? new Date(v).toLocaleString() : '—';
                if (c.pill) return `<td>${RZ.pill(r[c.key])}</td>`;
                const cls = c.wrap ? ' class="wrap"' : v ? '' : ' class="muted"';
                return `<td${cls}>${RZ.esc(v || '—')}</td>`;
              })
              .join('') +
            '</tr>',
        )
        .join('')
    : `<tr><td class="muted" colspan="${cols.length}">Nothing here.</td></tr>`;
  RZ.el('count').textContent = `${list.length} row(s) · ${TAB}`;
}

/* ── tabs / search ── */
RZ.el('tabs').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  TAB = e.target.dataset.tab;
  RZ.el('tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
  render();
});
RZ.el('search').addEventListener('input', render);

/* ── CSV export ── */
function exportCsv() {
  const cols = COLUMNS[TAB];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = cols.map((c) => esc(c.label)).join(',');
  const body = rows()
    .map((r) => cols.map((c) => esc(c.time ? (c.get(r) ? new Date(c.get(r)).toISOString() : '') : c.get(r))).join(','))
    .join('\n');
  const csv = header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `repair-zone-${TAB}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

window.load = load;
window.exportCsv = exportCsv;

boot();
