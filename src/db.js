import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/**
 * Tiny synchronous JSON store. Perfect for a single-booth workload: one process
 * (web server + Discord bot share it), a few hundred records over a weekend.
 * No native dependencies, no DB server to babysit at a convention.
 */

export const REPAIR_STATUSES = ['open', 'claimed', 'in_progress', 'done', 'unable', 'picked_up'];
export const TOOL_STATUSES = ['available', 'out', 'maintenance'];

/**
 * Request types. `tag` is the forum tag name the bot creates/applies so posts
 * are filterable in Discord (e.g. "3D Print Request"). Keep values stable — the
 * website <select> and the Discord modal both send these.
 */
export const REPAIR_TYPES = [
  { value: 'repair', label: 'General Repair', emoji: '🔧', tag: 'Repair' },
  { value: '3dprint', label: '3D Print Request', emoji: '🖨️', tag: '3D Print' },
  { value: 'electronics', label: 'Electronics / Soldering', emoji: '⚡', tag: 'Electronics' },
  { value: 'other', label: 'Other', emoji: '❓', tag: 'Other' },
];
export const REPAIR_TYPE_VALUES = REPAIR_TYPES.map((t) => t.value);
export function repairTypeMeta(value) {
  return REPAIR_TYPES.find((t) => t.value === value) || REPAIR_TYPES[0];
}

function nowISO() {
  return new Date().toISOString();
}

function emptyDb() {
  return {
    counters: { repair: 0, rental: 0, tool: 0 },
    repairs: [],
    rentals: [],
    tools: [],
  };
}

let db = emptyDb();

function ensureLoaded() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
    } catch (err) {
      console.error('[db] Could not parse db.json, starting fresh:', err.message);
      db = emptyDb();
    }
  }
  // No seed inventory: the booth tracks tools by free-text entry (borrow form +
  // manual staff checkout) rather than a maintained "live list". Starting empty
  // also means deleted tools stay deleted across restarts — a non-empty seed
  // used to reappear whenever inventory hit zero (e.g. Passenger app restarts).
  save();
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

ensureLoaded();

/* ───────────────────────────── Repairs ───────────────────────────── */

export function createRepair(data) {
  db.counters.repair += 1;
  const record = {
    id: db.counters.repair,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    source: data.source || 'web',
    type: REPAIR_TYPE_VALUES.includes(data.type) ? data.type : 'repair',
    name: data.name,
    phone: data.phone || '',
    contact: data.contact || '',
    boothId: data.boothId || '',
    item: data.item,
    issue: data.issue,
    notes: data.notes || '',
    status: 'open',
    assignee: null,
    discord: data.discord || null, // { userId, threadId, guildId }
    agreedTerms: Boolean(data.agreedTerms),
  };
  db.repairs.push(record);
  save();
  return record;
}

export function listRepairs() {
  return [...db.repairs].sort((a, b) => b.id - a.id);
}

export function getRepair(id) {
  return db.repairs.find((r) => r.id === Number(id)) || null;
}

export function updateRepair(id, patch) {
  const r = getRepair(id);
  if (!r) return null;
  const allowed = ['status', 'assignee', 'notes', 'phone', 'contact', 'boothId', 'item', 'issue', 'type'];
  for (const key of allowed) {
    if (key in patch && patch[key] !== undefined) r[key] = patch[key];
  }
  if (patch.discord) r.discord = { ...(r.discord || {}), ...patch.discord };
  r.updatedAt = nowISO();
  save();
  return r;
}

/* ───────────────────────────── Tools ───────────────────────────── */

export function listTools() {
  return [...db.tools].sort((a, b) => a.name.localeCompare(b.name));
}

export function getTool(id) {
  return db.tools.find((t) => t.id === Number(id)) || null;
}

export function createTool(data) {
  db.counters.tool += 1;
  const tool = {
    id: db.counters.tool,
    name: data.name,
    category: data.category || 'General',
    requiresTraining: Boolean(data.requiresTraining),
    status: 'available',
    borrowerName: null,
    borrowerBooth: null,
    checkedOutAt: null,
    rentalId: null,
    notes: data.notes || '',
  };
  db.tools.push(tool);
  save();
  return tool;
}

export function updateTool(id, patch) {
  const t = getTool(id);
  if (!t) return null;
  const allowed = ['name', 'category', 'requiresTraining', 'status', 'notes', 'borrowerName', 'borrowerBooth', 'checkedOutAt', 'rentalId'];
  for (const key of allowed) {
    if (key in patch && patch[key] !== undefined) t[key] = patch[key];
  }
  save();
  return t;
}

export function deleteTool(id) {
  const idx = db.tools.findIndex((t) => t.id === Number(id));
  if (idx === -1) return false;
  db.tools.splice(idx, 1);
  save();
  return true;
}

/* ───────────────────────────── Rentals ───────────────────────────── */

/**
 * Check a tool out to a borrower. Two modes:
 *  - Free text (public borrow form): pass `toolName` — the borrower types what
 *    they're taking; the rental is logged with no inventory record.
 *  - Inventory-linked (staff "check out on behalf"): pass a `toolId` — the tool
 *    record is looked up and flipped to "out" so availability stays accurate.
 * Returns { rental, tool } (tool is null for free-text rentals) or throws.
 */
export function createRental(data) {
  let tool = null;
  let toolName = (data.toolName || '').trim();

  if (data.toolId) {
    tool = getTool(data.toolId);
    if (!tool) throw new Error('Tool not found');
    if (tool.status !== 'available') throw new Error(`"${tool.name}" is currently ${tool.status} and cannot be borrowed`);
    toolName = tool.name;
  }
  if (!toolName) throw new Error('Please enter the tool you want to borrow.');

  db.counters.rental += 1;
  const rental = {
    id: db.counters.rental,
    createdAt: nowISO(),
    toolId: tool ? tool.id : null,
    toolName,
    name: data.name,
    boothId: data.boothId || '',
    phone: data.phone || '',
    timeOut: nowISO(),
    timeIn: null,
    status: 'out',
    agreedTerms: Boolean(data.agreedTerms),
  };
  db.rentals.push(rental);

  if (tool) {
    tool.status = 'out';
    tool.borrowerName = rental.name;
    tool.borrowerBooth = rental.boothId;
    tool.checkedOutAt = rental.timeOut;
    tool.rentalId = rental.id;
  }
  save();
  return { rental, tool };
}

export function listRentals() {
  return [...db.rentals].sort((a, b) => b.id - a.id);
}

export function getRental(id) {
  return db.rentals.find((r) => r.id === Number(id)) || null;
}

/** Return a borrowed tool: mark rental returned and free the tool. */
export function returnRental(id) {
  const rental = getRental(id);
  if (!rental) return null;
  if (rental.status !== 'returned') {
    rental.status = 'returned';
    rental.timeIn = nowISO();
    const tool = getTool(rental.toolId);
    if (tool && tool.rentalId === rental.id) {
      tool.status = 'available';
      tool.borrowerName = null;
      tool.borrowerBooth = null;
      tool.checkedOutAt = null;
      tool.rentalId = null;
    }
    save();
  }
  return rental;
}

/** Undo an accidental check-in: flip a returned rental back to "out". */
export function reopenRental(id) {
  const rental = getRental(id);
  if (!rental) return null;
  if (rental.status !== 'out') {
    rental.status = 'out';
    rental.timeIn = null;
    // Re-attach the tool only if it's free (not since lent to someone else).
    const tool = getTool(rental.toolId);
    if (tool && !tool.rentalId) {
      tool.status = 'out';
      tool.borrowerName = rental.name;
      tool.borrowerBooth = rental.boothId;
      tool.checkedOutAt = rental.timeOut;
      tool.rentalId = rental.id;
    }
    save();
  }
  return rental;
}

/**
 * Wipe ALL live data — repairs, rentals, tools, and the ID counters — back to a
 * clean slate. Super-admin only (see the reset endpoint). Used when moving from
 * testing to real use, or to a different Discord server. Returns the pre-reset
 * counts so the caller can report what was cleared.
 */
export function resetData() {
  const cleared = { repairs: db.repairs.length, rentals: db.rentals.length, tools: db.tools.length };
  db = emptyDb();
  save();
  return cleared;
}

export function stats() {
  return {
    repairs: {
      total: db.repairs.length,
      open: db.repairs.filter((r) => ['open', 'claimed', 'in_progress'].includes(r.status)).length,
      done: db.repairs.filter((r) => ['done', 'picked_up'].includes(r.status)).length,
      unable: db.repairs.filter((r) => r.status === 'unable').length,
    },
    tools: {
      total: db.tools.length,
      available: db.tools.filter((t) => t.status === 'available').length,
      out: db.tools.filter((t) => t.status === 'out').length,
    },
    // Rental-based counts work whether or not there's a maintained inventory:
    // free-text checkouts (no tool record) are still counted here.
    rentals: {
      total: db.rentals.length,
      out: db.rentals.filter((r) => r.status === 'out').length,
      returned: db.rentals.filter((r) => r.status === 'returned').length,
    },
  };
}
