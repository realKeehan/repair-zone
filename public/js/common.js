/* Shared helpers used across every page. */

// ── Theme toggle (persisted) ──
// localStorage access can THROW in privacy-restricted / embedded browser
// contexts (partitioned storage, blocked cookies, some webviews). Guard every
// access so a storage exception can never stop `toggleTheme` from being defined
// — otherwise the header button would silently do nothing.
(function initTheme() {
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage unavailable — theme still toggles for this session */
      }
    },
  };
  const prefersDark = () => Boolean(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);

  const saved = store.get('rz-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  window.toggleTheme = function () {
    const cur = document.documentElement.getAttribute('data-theme') || (prefersDark() ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('rz-theme', next);
  };
})();

// ── Small DOM + format helpers ──
const RZ = {
  el(id) {
    return document.getElementById(id);
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  statusLabel(s) {
    return (
      {
        open: 'Open',
        claimed: 'Claimed',
        in_progress: 'In progress',
        done: 'Repaired',
        unable: 'Unable',
        picked_up: 'Picked up',
        available: 'Available',
        out: 'Out',
        maintenance: 'Maintenance',
      }[s] || s
    );
  },
  pill(status) {
    return `<span class="pill ${RZ.esc(status)}">${RZ.esc(RZ.statusLabel(status))}</span>`;
  },
  typeMeta(v) {
    return (
      {
        repair: { e: '🔧', l: 'General Repair' },
        '3dprint': { e: '🖨️', l: '3D Print' },
        electronics: { e: '⚡', l: 'Electronics' },
        other: { e: '❓', l: 'Other' },
      }[v] || { e: '🔧', l: v || 'Repair' }
    );
  },
  timeAgo(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  },
  time(iso) {
    return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  },
  notice(node, type, msg) {
    if (!node) return;
    node.className = `notice show ${type}`;
    node.textContent = msg;
  },
  async api(path, { method = 'GET', body, token } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers['x-admin-token'] = token;
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* empty */
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
};

window.RZ = RZ;
