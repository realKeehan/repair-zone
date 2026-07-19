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

  // Bootstrap Icons as inline SVG — works under our self-only CSP (no CDN).
  // The toggle shows the sun in dark mode and the moon in light mode.
  const ICONS = {
    sun: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/></svg>`,
    moon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/><path d="M10.794 3.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387a1.73 1.73 0 0 0-1.097 1.097l-.387 1.162a.217.217 0 0 1-.412 0l-.387-1.162A1.73 1.73 0 0 0 9.31 6.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387a1.73 1.73 0 0 0 1.097-1.097z"/></svg>`,
  };
  const isDark = () => (document.documentElement.getAttribute('data-theme') || (prefersDark() ? 'dark' : 'light')) === 'dark';
  function renderToggleIcons() {
    const icon = isDark() ? ICONS.sun : ICONS.moon;
    document.querySelectorAll('.theme-toggle').forEach((b) => {
      b.innerHTML = icon;
    });
  }

  const saved = store.get('rz-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  window.toggleTheme = function () {
    const cur = document.documentElement.getAttribute('data-theme') || (prefersDark() ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('rz-theme', next);
    renderToggleIcons();
  };

  // Scripts load at the end of <body>, so the buttons exist — but guard anyway.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderToggleIcons);
  } else {
    renderToggleIcons();
  }
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
