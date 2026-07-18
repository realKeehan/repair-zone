let TOOLS = [];

async function loadTools() {
  try {
    const { tools } = await RZ.api('/api/tools');
    TOOLS = tools;
    renderSelect();
    renderInventory();
  } catch (err) {
    RZ.notice(RZ.el('notice'), 'error', 'Could not load the tool list: ' + err.message);
  }
}

function renderSelect() {
  const sel = RZ.el('toolId');
  const prev = sel.value;
  const available = TOOLS.filter((t) => t.status === 'available');
  const unavailable = TOOLS.filter((t) => t.status !== 'available');

  let html = '<option value="">— Select a tool —</option>';
  if (available.length) {
    html += '<optgroup label="Available now">';
    for (const t of available) html += `<option value="${t.id}">${RZ.esc(t.name)}${t.requiresTraining ? ' (training req.)' : ''}</option>`;
    html += '</optgroup>';
  }
  if (unavailable.length) {
    html += '<optgroup label="Currently unavailable">';
    for (const t of unavailable) html += `<option value="${t.id}" disabled>${RZ.esc(t.name)} — ${RZ.esc(RZ.statusLabel(t.status))}</option>`;
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  if (prev) sel.value = prev;
  updateToolMeta();
}

function updateToolMeta() {
  const t = TOOLS.find((x) => String(x.id) === RZ.el('toolId').value);
  const meta = RZ.el('tool-meta');
  if (!t) return (meta.textContent = '');
  meta.innerHTML = t.requiresTraining
    ? '⚠️ This tool requires a quick demo/authorization from a volunteer before use.'
    : `Category: ${RZ.esc(t.category)}`;
}

function renderInventory() {
  const body = RZ.el('inventory');
  if (!TOOLS.length) return (body.innerHTML = '<tr><td colspan="3" class="muted">No tools listed.</td></tr>');
  body.innerHTML = TOOLS.map(
    (t) => `<tr>
      <td><strong>${RZ.esc(t.name)}</strong>${t.requiresTraining ? ' <span class="muted">· training req.</span>' : ''}</td>
      <td class="muted">${RZ.esc(t.category)}</td>
      <td>${RZ.pill(t.status)}</td>
    </tr>`,
  ).join('');
}

RZ.el('toolId').addEventListener('change', updateToolMeta);

const form = RZ.el('borrow-form');
const notice = RZ.el('notice');
const btn = RZ.el('submit-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.className = 'notice';
  btn.disabled = true;
  btn.textContent = 'Checking out…';

  const body = {
    toolId: RZ.el('toolId').value,
    name: RZ.el('name').value,
    phone: RZ.el('phone').value,
    boothId: RZ.el('boothId').value,
    agreedTerms: RZ.el('agreedTerms').checked,
  };

  try {
    const data = await RZ.api('/api/rentals', { method: 'POST', body });
    form.style.display = 'none';
    RZ.el('success-title').textContent = `${data.rental.toolName} is yours`;
    RZ.el('success-body').textContent =
      `Checked out at ${RZ.time(data.rental.timeOut)}. Please return it to the Repair Zone booth by end of day, clean and working. Thanks!`;
    RZ.el('success-panel').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    RZ.notice(notice, 'error', err.message);
    btn.disabled = false;
    btn.textContent = 'Check out this tool';
    loadTools(); // refresh in case it was just taken
  }
});

loadTools();
