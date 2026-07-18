import express from 'express';
import rateLimit from 'express-rate-limit';
import { config, discordEnabled } from '../config.js';
import * as db from '../db.js';
import * as notify from '../discord/notify.js';

export const apiRouter = express.Router();

/* ── helpers ─────────────────────────────────────────────── */

function str(v, max = 2000) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function requireFields(obj, fields) {
  const missing = fields.filter((f) => !obj[f]);
  return missing;
}

/** Admin auth. Two modes:
 *  - external (ADMIN_AUTH=external): access is gated upstream by Apache/.htaccess
 *    Basic Auth, so the app trusts the request and lets it through.
 *  - token (default): require a matching x-admin-token header/query. */
function requireAdmin(req, res, next) {
  if (config.adminAuthExternal) return next();
  const token = req.get('x-admin-token') || req.query.token || '';
  if (!config.adminToken) {
    return res.status(503).json({ error: 'Admin auth not configured. Set ADMIN_TOKEN, or set ADMIN_AUTH=external and protect /admin with .htaccess.' });
  }
  if (token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid admin token.' });
  }
  next();
}

// Throttle public submission endpoints to blunt spam/abuse at the booth.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please slow down and try again shortly.' },
});

/* ── public: config surface for the front-end ────────────── */

apiRouter.get('/meta', (req, res) => {
  res.json({ discordEnabled, stats: db.stats(), repairTypes: db.REPAIR_TYPES });
});

/* ── public: tools (live availability for the borrow form) ─ */

apiRouter.get('/tools', (req, res) => {
  // Public view: name/category/status only (no borrower PII).
  const tools = db.listTools().map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    requiresTraining: t.requiresTraining,
    status: t.status,
  }));
  res.json({ tools });
});

/* ── public: create a repair request ─────────────────────── */

apiRouter.post('/repairs', publicLimiter, async (req, res) => {
  const body = req.body || {};
  const data = {
    source: 'web',
    type: str(body.type, 20),
    name: str(body.name, 120),
    phone: str(body.phone, 40),
    contact: str(body.contact, 120),
    boothId: str(body.boothId, 60),
    item: str(body.item, 160),
    issue: str(body.issue, 2000),
    notes: str(body.notes, 1000),
    agreedTerms: body.agreedTerms === true || body.agreedTerms === 'true',
  };

  const missing = requireFields(data, ['name', 'item', 'issue']);
  if (missing.length) return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  if (!data.contact && !data.phone) return res.status(400).json({ error: 'Please provide a phone number or another way to reach you.' });
  if (!data.agreedTerms) return res.status(400).json({ error: 'You must accept the Terms & Conditions to submit a request.' });

  const repair = db.createRepair(data);

  // Fire-and-forget Discord side effects; never block the user's submission on them.
  notify.onRepairCreated(repair).catch((e) => console.error('[discord] repair notify failed:', e.message));

  res.status(201).json({ ok: true, id: repair.id, repair: publicRepair(repair) });
});

function publicRepair(r) {
  return { id: r.id, item: r.item, status: r.status, createdAt: r.createdAt };
}

/* ── public: borrow a tool (checkout) ────────────────────── */

apiRouter.post('/rentals', publicLimiter, async (req, res) => {
  const body = req.body || {};
  const data = {
    toolName: str(body.toolName, 160),
    name: str(body.name, 120),
    boothId: str(body.boothId, 60),
    phone: str(body.phone, 40),
    agreedTerms: body.agreedTerms === true || body.agreedTerms === 'true',
  };
  if (!data.toolName) return res.status(400).json({ error: 'Please enter the tool you want to borrow.' });
  const missing = requireFields(data, ['name']);
  if (missing.length) return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  if (!data.agreedTerms) return res.status(400).json({ error: 'You must accept the Tool Rental Terms to borrow a tool.' });

  try {
    const { rental, tool } = db.createRental(data);
    notify.onRentalCreated(rental, tool).catch((e) => console.error('[discord] rental notify failed:', e.message));
    res.status(201).json({ ok: true, rental: { id: rental.id, toolName: rental.toolName, timeOut: rental.timeOut } });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ── admin: auth check ───────────────────────────────────── */

apiRouter.get('/admin/ping', requireAdmin, (req, res) => {
  res.json({ ok: true, stats: db.stats() });
});

/* ── admin: repairs ──────────────────────────────────────── */

apiRouter.get('/admin/repairs', requireAdmin, (req, res) => {
  res.json({ repairs: db.listRepairs() });
});

apiRouter.patch('/admin/repairs/:id', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.status !== undefined) {
    if (!db.REPAIR_STATUSES.includes(body.status)) return res.status(400).json({ error: 'Invalid status.' });
    patch.status = body.status;
  }
  for (const k of ['assignee', 'notes', 'phone', 'contact', 'boothId', 'item', 'issue']) {
    if (body[k] !== undefined) patch[k] = str(body[k], 2000);
  }
  const updated = db.updateRepair(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Repair not found.' });

  notify.onRepairUpdated(updated).catch((e) => console.error('[discord] repair update notify failed:', e.message));
  res.json({ ok: true, repair: updated });
});

/* ── admin: tools inventory ──────────────────────────────── */

apiRouter.get('/admin/tools', requireAdmin, (req, res) => {
  res.json({ tools: db.listTools() });
});

apiRouter.post('/admin/tools', requireAdmin, (req, res) => {
  const body = req.body || {};
  const name = str(body.name, 160);
  if (!name) return res.status(400).json({ error: 'Tool name is required.' });
  const tool = db.createTool({
    name,
    category: str(body.category, 60) || 'General',
    requiresTraining: body.requiresTraining === true || body.requiresTraining === 'true',
    notes: str(body.notes, 500),
  });
  res.status(201).json({ ok: true, tool });
});

apiRouter.patch('/admin/tools/:id', requireAdmin, (req, res) => {
  const body = req.body || {};
  const patch = {};
  for (const k of ['name', 'category', 'notes']) if (body[k] !== undefined) patch[k] = str(body[k], 500);
  if (body.requiresTraining !== undefined) patch.requiresTraining = body.requiresTraining === true || body.requiresTraining === 'true';
  if (body.status !== undefined) {
    if (!db.TOOL_STATUSES.includes(body.status)) return res.status(400).json({ error: 'Invalid tool status.' });
    patch.status = body.status;
    // Clearing "out" manually should release borrower info.
    if (body.status === 'available') {
      patch.borrowerName = null;
      patch.borrowerBooth = null;
      patch.checkedOutAt = null;
      patch.rentalId = null;
    }
  }
  const tool = db.updateTool(req.params.id, patch);
  if (!tool) return res.status(404).json({ error: 'Tool not found.' });
  res.json({ ok: true, tool });
});

apiRouter.delete('/admin/tools/:id', requireAdmin, (req, res) => {
  const ok = db.deleteTool(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Tool not found.' });
  res.json({ ok: true });
});

/* ── admin: rentals / borrowing tracking ─────────────────── */

apiRouter.get('/admin/rentals', requireAdmin, (req, res) => {
  res.json({ rentals: db.listRentals() });
});

apiRouter.post('/admin/rentals', requireAdmin, (req, res) => {
  // Staff can check a tool out on someone's behalf.
  const body = req.body || {};
  const data = {
    toolId: Number(body.toolId),
    name: str(body.name, 120),
    boothId: str(body.boothId, 60),
    phone: str(body.phone, 40),
    agreedTerms: true,
  };
  if (!data.toolId || !data.name) return res.status(400).json({ error: 'Tool and borrower name are required.' });
  try {
    const { rental, tool } = db.createRental(data);
    notify.onRentalCreated(rental, tool).catch(() => {});
    res.status(201).json({ ok: true, rental });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

apiRouter.patch('/admin/rentals/:id/return', requireAdmin, (req, res) => {
  const rental = db.returnRental(req.params.id);
  if (!rental) return res.status(404).json({ error: 'Rental not found.' });
  res.json({ ok: true, rental });
});
