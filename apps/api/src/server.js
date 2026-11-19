// OmniCRM API — auth, contacts, deals, dashboard, AI follow-up engine (v0.1)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import db from './db.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'receipts');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

// ---- auth guard ----
function requireAuth(req, reply, done) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return reply.code(401).send({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    done();
  } catch {
    reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

// ---- role-based access: staff see only their department's sections ----
const SECTION_ACCESS = {
  sales: ['dashboard', 'sales', 'customers', 'inbox', 'invoices', 'followups', 'feedback', 'reports', 'pipeline'],
  support: ['dashboard', 'support', 'inbox', 'feedback', 'reports'],
  inventory: ['dashboard', 'inventory', 'product', 'reports'],
  hr: ['dashboard', 'hr', 'reports'],
  account: ['dashboard', 'invoices', 'reports'],
};
const gate = (section) => (req, reply, done) => {
  const dept = req.user.dept;
  if (!dept) return done(); // owner sees everything
  const allowed = SECTION_ACCESS[dept] || [];
  if (section === 'dashboard' || allowed.includes(section)) return done();
  return reply.code(403).send({ error: `Your department (${dept}) does not have access to this section.` });
};
const orgFeatures = (userId) => {
  const row = db.prepare("SELECT value FROM org_settings WHERE user_id = ? AND key = 'features'").get(userId);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
};

// ---- auth routes ----
app.post('/auth/register', async (req, reply) => {
  const { email, password, name, business_name } = req.body || {};
  if (!email || !password || !name) return reply.code(400).send({ error: 'email, password and name are required' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return reply.code(409).send({ error: 'Email already registered' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, name, password_hash, business_name) VALUES (?, ?, ?, ?)')
    .run(email, name, hash, business_name || 'My Business');
  const token = jwt.sign({ id: info.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: info.lastInsertRowid, email, name, business_name: business_name || 'My Business' } };
});

app.post('/auth/login', async (req, reply) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    // staff login: department-scoped access
    const staff = db.prepare('SELECT * FROM staff WHERE email = ? AND can_login = 1').get(email);
    if (!staff || !bcrypt.compareSync(password || '', staff.password_hash || '')) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: staff.user_id, email: staff.email, dept: staff.department, staff_id: staff.id, name: staff.name }, JWT_SECRET, { expiresIn: '7d' });
    return { token, user: { id: staff.user_id, email: staff.email, name: staff.name, dept: staff.department, staff: true, business_name: null } };
  }
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, guest: !!user.is_guest }, JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email, name: user.name, business_name: user.business_name, guest: !!user.is_guest } };
});

// ---- read-only guard for guest sessions: browse anything, mutate nothing ----
app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return;
  const allowlist = ['/auth/login', '/auth/register'];
  if (allowlist.includes(req.url.split('?')[0])) return;
  if (req.url.split('?')[0].startsWith('/pay/')) return;
  if (req.url.split('?')[0].startsWith('/webhooks/')) return;
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.guest) {
      return reply.code(403).send({ error: 'Read-only guest session — changes are disabled in this demo.' });
    }
  } catch { /* unauthenticated mutations are handled by route guards */ }
});

// ---- contacts ----
app.get('/contacts', { preHandler: requireAuth }, async (req) => {
  const { q, tag } = req.query || {};
  let rows;
  if (q) {
    rows = db.prepare(`SELECT * FROM contacts WHERE user_id = ? AND (name LIKE ? OR company LIKE ? OR phone LIKE ?) ORDER BY created_at DESC`)
      .all(req.user.id, `%${q}%`, `%${q}%`, `%${q}%`);
  } else if (tag && tag !== 'all') {
    rows = db.prepare('SELECT * FROM contacts WHERE user_id = ? AND tags LIKE ? ORDER BY created_at DESC').all(req.user.id, `%${tag}%`);
  } else {
    rows = db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  }
  return { contacts: rows };
});

app.post('/contacts', { preHandler: requireAuth }, async (req, reply) => {
  const c = req.body || {};
  if (!c.name && !c.company) return reply.code(400).send({ error: 'name or company is required' });
  const info = db.prepare(`INSERT INTO contacts (user_id, name, company, phone, email, tags, status, debt_ngn, deal_value_ngn, next_action, next_followup_date, staff_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, c.name || null, c.company || null, c.phone || null, c.email || null, c.tags || 'lead', c.status || 'new',
      c.debt_ngn || 0, c.deal_value_ngn || 0, c.next_action || null, c.next_followup_date || null, c.staff_id || null);
  return { contact: db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/contacts/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Contact not found' });
  const c = req.body || {};
  db.prepare('UPDATE contacts SET name = ?, company = ?, phone = ?, email = ?, tags = ?, status = ?, debt_ngn = ?, deal_value_ngn = ?, staff_id = ? WHERE id = ? AND user_id = ?')
    .run(c.name ?? existing.name, c.company ?? existing.company, c.phone ?? existing.phone, c.email ?? existing.email, c.tags ?? existing.tags, c.status ?? existing.status,
      Number(c.debt_ngn ?? existing.debt_ngn), Number(c.deal_value_ngn ?? existing.deal_value_ngn), c.staff_id ?? existing.staff_id, req.params.id, req.user.id);
  return { contact: db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id) };
});

app.delete('/contacts/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Contact not found' });
  db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
});

app.patch('/contacts/:id', { preHandler: requireAuth }, async (req, reply) => {
  const c = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Contact not found' });
  const b = req.body || {};
  const next = {
    name: b.name ?? c.name,
    company: b.company ?? c.company,
    phone: b.phone ?? c.phone,
    email: b.email ?? c.email,
    tags: b.tags ?? c.tags,
    status: b.status ?? c.status,
    debt_ngn: b.debt_ngn ?? c.debt_ngn,
    deal_value_ngn: b.deal_value_ngn ?? c.deal_value_ngn,
    next_action: b.next_action ?? c.next_action,
    next_followup_date: b.next_followup_date ?? c.next_followup_date,
  };
  db.prepare(`UPDATE contacts SET name=?, company=?, phone=?, email=?, tags=?, status=?, debt_ngn=?, deal_value_ngn=?, next_action=?, next_followup_date=? WHERE id=?`)
    .run(next.name, next.company, next.phone, next.email, next.tags, next.status, next.debt_ngn, next.deal_value_ngn, next.next_action, next.next_followup_date, c.id);
  return { contact: db.prepare('SELECT * FROM contacts WHERE id = ?').get(c.id) };
});

// ---- deals ----
app.get('/deals', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`SELECT d.*, c.name AS contact_name FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id WHERE d.user_id = ? ORDER BY d.created_at DESC`)
    .all(req.user.id);
  return { deals: rows };
});

app.post('/deals', { preHandler: requireAuth }, async (req, reply) => {
  const d = req.body || {};
  if (!d.title) return reply.code(400).send({ error: 'title is required' });
  const info = db.prepare('INSERT INTO deals (user_id, contact_id, title, value_ngn, stage) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, d.contact_id || null, d.title, d.value_ngn || 0, d.stage || 'lead');
  return { deal: db.prepare('SELECT * FROM deals WHERE id = ?').get(info.lastInsertRowid) };
});

app.patch('/deals/:id', { preHandler: requireAuth }, async (req, reply) => {
  const d = db.prepare('SELECT * FROM deals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!d) return reply.code(404).send({ error: 'Deal not found' });
  const b = req.body || {};
  db.prepare('UPDATE deals SET title=?, value_ngn=?, stage=? WHERE id=?')
    .run(b.title ?? d.title, b.value_ngn ?? d.value_ngn, b.stage ?? d.stage, d.id);
  return { deal: db.prepare('SELECT * FROM deals WHERE id = ?').get(d.id) };
});

// ---- activities ----
app.post('/activities', { preHandler: requireAuth }, async (req, reply) => {
  const a = req.body || {};
  if (!a.kind) return reply.code(400).send({ error: 'kind is required' });
  const info = db.prepare('INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, a.contact_id || null, a.kind, a.channel || null, a.body || null);
  const contactId = a.contact_id;
  if (contactId) {
    db.prepare("UPDATE contacts SET last_contacted_at = datetime('now') WHERE id = ? AND user_id = ?").run(contactId, req.user.id);
  }
  return { activity: db.prepare('SELECT * FROM activities WHERE id = ?').get(info.lastInsertRowid) };
});

// ---- dashboard KPIs ----
app.get('/dashboard', { preHandler: requireAuth }, async (req) => {
  const userId = req.user.id;
  const contacts = db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?').get(userId).n;
  const debtors = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(debt_ngn),0) AS total FROM contacts WHERE user_id = ? AND debt_ngn > 0').get(userId);
  const pipeline = db.prepare("SELECT COALESCE(SUM(value_ngn),0) AS total FROM deals WHERE user_id = ? AND stage NOT IN ('won','lost')").get(userId);
  const dueToday = db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE user_id = ? AND next_followup_date IS NOT NULL AND next_followup_date <= date('now')").get(userId);
  return {
    kpis: {
      contacts,
      debtors: debtors.total,
      debtor_count: debtors.n,
      pipeline_value_ngn: pipeline.total,
      followups_due_today: dueToday.n,
    }
  };
});

// ---- AI follow-up engine (v0: rule-based; LLM hook comes next) ----
app.get('/ai/followups', { preHandler: requireAuth }, async (req) => {
  const userId = req.user.id;
  const due = db.prepare(`SELECT id, name, company, phone, next_action, next_followup_date, debt_ngn FROM contacts
    WHERE user_id = ? AND next_followup_date IS NOT NULL AND next_followup_date <= date('now')`).all(userId);
  const followups = due.map((c) => {
    let draft;
    if (c.debt_ngn > 0) {
      draft = `Hello ${c.company ? c.company.split(' ')[0] : c.name}, this is a gentle reminder from your records: a balance of ₦${Number(c.debt_ngn).toLocaleString()} is still outstanding. Kindly confirm when payment can be made. Thank you!`;
    } else {
      draft = `Hi ${c.name}, just following up on the proposal I sent. Happy to walk you through the tier that suits your needs — 15 minutes is all I would need. Would this week work for a call?`;
    }
    return { contact_id: c.id, name: c.name, company: c.company, draft, reason: c.next_action || 'follow-up due' };
  });
  return { followups };
});

// ---- WhatsApp inbox ----
app.get('/inbox', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`
    SELECT c.id AS contact_id, c.name, c.company, c.status, c.tags,
           m.body AS last_message, m.direction AS last_direction, m.created_at AS last_at,
           (SELECT COUNT(*) FROM messages WHERE contact_id = c.id AND direction = 'in' AND read = 0) AS unread
    FROM contacts c
    JOIN messages m ON m.id = (SELECT id FROM messages WHERE contact_id = c.id AND user_id = ? ORDER BY id DESC LIMIT 1)
    WHERE c.user_id = ?
    ORDER BY m.id DESC`).all(req.user.id, req.user.id);
  return { threads: rows };
});

app.get('/messages', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id } = req.query || {};
  if (!contact_id) return reply.code(400).send({ error: 'contact_id is required' });
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  const messages = db.prepare('SELECT * FROM messages WHERE contact_id = ? AND user_id = ? ORDER BY id ASC').all(contact_id, req.user.id);
  return { contact, messages };
});

app.post('/messages', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id, body } = req.body || {};
  if (!contact_id || !body) return reply.code(400).send({ error: 'contact_id and body are required' });
  const contact = db.prepare('SELECT id, phone FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  let status = 'sent';
  // Real WhatsApp delivery when the Cloud API is configured; otherwise stored as sent (simulation).
  if (waEnabled() && contact.phone) {
    const to = '234' + String(contact.phone).replace(/^0/, '').replace(/\D/g, '');
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      });
      const data = await res.json();
      status = data.messages?.length ? 'sent' : 'failed';
    } catch { status = 'failed'; }
  }
  const info = db.prepare('INSERT INTO messages (user_id, contact_id, direction, body, status) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, 'out', body, status);
  db.prepare('INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, 'whatsapp', 'whatsapp', body);
  db.prepare("UPDATE contacts SET last_contacted_at = datetime('now') WHERE id = ? AND user_id = ?").run(contact_id, req.user.id);
  return { message: db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid) };
});

app.post('/messages/:id/read', { preHandler: requireAuth }, async (req, reply) => {
  db.prepare('UPDATE messages SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
});

// AI draft: next best message for a contact from its state
app.get('/ai/draft', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id } = req.query || {};
  if (!contact_id) return reply.code(400).send({ error: 'contact_id is required' });
  const c = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Contact not found' });
  let draft;
  const first = c.company ? c.company.split(' ')[0] : c.name;
  if (c.debt_ngn > 0) {
    draft = `Hello ${first}, this is a gentle reminder from your records: a balance of ₦${Number(c.debt_ngn).toLocaleString()} is still outstanding. Kindly confirm when payment can be made. Thank you!`;
  } else if (c.status === 'proposal_sent') {
    draft = `Hi ${first}, just following up on the proposal I sent. Happy to walk you through the tier that suits your needs — 15 minutes is all I would need. Would this week work for a call?`;
  } else if (c.status === 'won') {
    draft = `Hello ${first}, thank you for partnering with us! Your order is confirmed — delivery details are on the way.`;
  } else {
    draft = `Hello ${first}, hope business is going well. Just checking in — is there anything we can support you with this week?`;
  }
  return { contact_id: c.id, draft };
});

app.get('/products', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare('SELECT * FROM products WHERE user_id = ? ORDER BY category, name').all(req.user.id);
  const products = rows.map((p) => ({ ...p, low: p.stock <= p.low_stock_at, margin: p.unit_price > 0 ? Math.round(((p.unit_price - p.unit_cost) / p.unit_price) * 100) : 0 }));
  const stock_value = products.reduce((s, p) => s + p.stock * p.unit_cost, 0);
  const low_count = products.filter((p) => p.low).length;
  return { products, stock_value, low_count, total: products.length };
});

app.post('/products', { preHandler: requireAuth }, async (req, reply) => {
  const { name, sku, category, stock, low_stock_at, unit_cost, unit_price } = req.body || {};
  if (!name) return reply.code(400).send({ error: 'Product name is required' });
  const info = db.prepare('INSERT INTO products (user_id, name, sku, category, stock, low_stock_at, unit_cost, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, sku || null, category || 'General', Number(stock) || 0, Number(low_stock_at) || 5, Number(unit_cost) || 0, Number(unit_price) || 0);
  return { product: db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/products/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Product not found' });
  const { name, sku, category, stock, low_stock_at, unit_cost, unit_price } = req.body || {};
  db.prepare('UPDATE products SET name = ?, sku = ?, category = ?, stock = ?, low_stock_at = ?, unit_cost = ?, unit_price = ? WHERE id = ? AND user_id = ?')
    .run(name ?? existing.name, sku ?? existing.sku, category ?? existing.category, Number(stock ?? existing.stock), Number(low_stock_at ?? existing.low_stock_at), Number(unit_cost ?? existing.unit_cost), Number(unit_price ?? existing.unit_price), req.params.id, req.user.id);
  return { product: db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) };
});

app.delete('/products/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Product not found' });
  db.prepare('DELETE FROM products WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
});

app.get('/tickets', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`
    SELECT t.*, c.company, c.name FROM tickets t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.user_id = ? ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.id DESC`).all(req.user.id);
  const counts = { open: 0, pending: 0, closed: 0 };
  for (const t of rows) counts[t.status] = (counts[t.status] || 0) + 1;
  return { tickets: rows, counts };
});

app.post('/tickets', { preHandler: requireAuth }, async (req, reply) => {
  const { subject, status, priority, contact_id } = req.body || {};
  if (!subject) return reply.code(400).send({ error: 'Ticket subject is required' });
  const info = db.prepare('INSERT INTO tickets (user_id, contact_id, subject, status, priority) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id || null, subject, status || 'open', priority || 'medium');
  return { ticket: db.prepare('SELECT * FROM tickets WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/tickets/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Ticket not found' });
  const { subject, status, priority, contact_id } = req.body || {};
  db.prepare('UPDATE tickets SET subject = ?, status = ?, priority = ?, contact_id = ? WHERE id = ? AND user_id = ?')
    .run(subject ?? existing.subject, status ?? existing.status, priority ?? existing.priority, contact_id ?? existing.contact_id, req.params.id, req.user.id);
  return { ticket: db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) };
});

app.delete('/tickets/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT id FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Ticket not found' });
  db.prepare('DELETE FROM tickets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
});

// ---- FX: live naira rates with fallback (never blocks invoicing) ----
const FX_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'];
const FX_FALLBACK = { USD: 1350, EUR: 1486, GBP: 1780 };
// Revenue stream: processing fee on foreign-currency conversion (of invoice total)
const FX_FEE_RATE = Number(process.env.FX_FEE_RATE || 0.015);
let FX_CACHE = { rates: null, at: 0, source: 'fallback' };
async function fxRates() {
  if (FX_CACHE.rates && Date.now() - FX_CACHE.at < 10 * 60 * 1000) return FX_CACHE;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await res.json();
    if (d.result === 'success' && d.rates?.NGN) {
      const ngnPerUsd = d.rates.NGN;
      FX_CACHE = {
        rates: { USD: ngnPerUsd, EUR: ngnPerUsd / d.rates.EUR, GBP: ngnPerUsd / d.rates.GBP },
        at: Date.now(),
        source: 'live',
      };
      return FX_CACHE;
    }
  } catch { /* fall back silently */ }
  return { rates: FX_FALLBACK, at: FX_CACHE.at, source: 'fallback' };
}

app.get('/fx', async () => {
  const { rates, source, at } = await fxRates();
  return { base: 'NGN', rates, source, fetched_at: new Date(at).toISOString() };
});

// ---- invoicing ----
const invStatus = (inv) => (inv.status === 'sent' && inv.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : inv.status);

app.get('/invoices', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`
    SELECT i.*, c.company, c.name FROM invoices i
    JOIN contacts c ON c.id = i.contact_id
    WHERE i.user_id = ? ORDER BY i.id DESC`).all(req.user.id);
  const invoices = rows.map((i) => ({ ...i, status: invStatus(i) }));
  const counts = { draft: 0, sent: 0, paid: 0, overdue: 0 };
  let receivables = 0;
  for (const i of invoices) {
    counts[i.status] = (counts[i.status] || 0) + 1;
    if (i.status === 'sent' || i.status === 'overdue') receivables += i.ngn_total || i.total;
  }
  return { invoices, counts, receivables };
});

app.get('/invoices/:id', { preHandler: requireAuth }, async (req, reply) => {
  const inv = db.prepare('SELECT i.*, c.company, c.name, c.phone, c.email FROM invoices i JOIN contacts c ON c.id = i.contact_id WHERE i.id = ? AND i.user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
  return { invoice: { ...inv, status: invStatus(inv) }, items, pay_link: `/pay.html?token=${inv.pay_token}` };
});

// edit a draft invoice: due date, currency, or full line-item replacement (totals recomputed)
app.put('/invoices/:id', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept && !['account', 'hr'].includes(req.user.dept)) {
    return reply.code(403).send({ error: 'Only admin or accounts can edit invoices.' });
  }
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  if (inv.status !== 'draft') return reply.code(400).send({ error: 'Only draft invoices can be edited. Void/re-issue after sending.' });
  const { due_date, items, currency } = req.body || {};
  const cur = (currency || inv.currency || 'NGN').toUpperCase();
  if (!FX_CURRENCIES.includes(cur)) return reply.code(400).send({ error: `Unsupported currency: ${cur}` });
  let newItems = inv.items;
  if (Array.isArray(items) && items.length > 0) {
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(inv.id);
    for (const it of items) {
      const qty = Number(it.qty) || 0; const up = Number(it.unit_price) || 0;
      db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, amount) VALUES (?, ?, ?, ?, ?)')
        .run(inv.id, it.description || 'Item', qty, up, qty * up);
    }
  }
  const currentItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
  const subtotal = currentItems.reduce((s, it) => s + it.amount, 0);
  const tax = Math.round(subtotal * 0.075);
  const total = subtotal + tax;
  const fx = await fxRates();
  const rate = cur === 'NGN' ? 1 : (inv.currency === cur && inv.fx_rate ? inv.fx_rate : (fx.rates[cur] || FX_FALLBACK[cur]));
  const feeRate = cur === 'NGN' ? 0 : FX_FEE_RATE;
  const fee = Math.round(total * feeRate);
  db.prepare('UPDATE invoices SET due_date = ?, currency = ?, fx_rate = ?, fee_rate = ?, fee = ?, subtotal = ?, tax = ?, total = ?, ngn_total = ? WHERE id = ? AND user_id = ?')
    .run(due_date || inv.due_date, cur, rate, feeRate, fee, subtotal, tax, total, Math.round((total + fee) * rate), inv.id, req.user.id);
  return { invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) };
});

app.post('/invoices', { preHandler: requireAuth }, async (req, reply) => {
  // sales reps raise orders, not invoices — only admin/accountant/HR create invoices
  if (req.user.dept && !['account', 'hr'].includes(req.user.dept)) {
    return reply.code(403).send({ error: 'Only admin or accounts can create invoices — sales reps raise orders instead.' });
  }
  const { contact_id, due_date, items, currency } = req.body || {};
  if (!contact_id || !Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'contact_id, due_date and items are required' });
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  const cur = (currency || 'NGN').toUpperCase();
  if (!FX_CURRENCIES.includes(cur)) return reply.code(400).send({ error: `Unsupported currency: ${cur}. Use NGN, USD, EUR or GBP.` });
  const fx = await fxRates();
  const rate = cur === 'NGN' ? 1 : (fx.rates[cur] || FX_FALLBACK[cur]);
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const taxRate = 7.5; // Nigerian VAT
  const tax = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + tax;
  const feeRate = cur === 'NGN' ? 0 : FX_FEE_RATE; // conversion processing fee
  const fee = Math.round(total * feeRate);
  const grandTotal = total + fee;
  const ngnTotal = Math.round(grandTotal * rate);
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) AS c FROM invoices WHERE user_id = ? AND number LIKE ?").get(req.user.id, `INV-${year}-%`).c;
  const number = `INV-${year}-${String(count + 1).padStart(3, '0')}`;
  const info = db.prepare('INSERT INTO invoices (user_id, contact_id, number, due_date, subtotal, tax_rate, tax, total, pay_token, currency, fx_rate, ngn_total, fee_rate, fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, number, due_date || new Date().toISOString().slice(0, 10), subtotal, taxRate, tax, total, randomUUID(), cur, rate, ngnTotal, feeRate, fee);
  for (const it of items) {
    const qty = Number(it.qty) || 0; const up = Number(it.unit_price) || 0;
    db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, amount) VALUES (?, ?, ?, ?, ?)')
      .run(info.lastInsertRowid, it.description || 'Item', qty, up, qty * up);
  }
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid);
  return { invoice: inv };
});

app.post('/invoices/:id/send', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept && !['account', 'hr'].includes(req.user.dept)) {
    return reply.code(403).send({ error: 'Only admin or accounts can send invoices.' });
  }
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(inv.id);
  db.prepare("INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, 'invoice', 'system', ?)")
    .run(req.user.id, inv.contact_id, `Invoice ${inv.number} (₦${Number(inv.total).toLocaleString()}) sent to customer`);
  db.prepare("UPDATE contacts SET last_contacted_at = datetime('now') WHERE id = ? AND user_id = ?").run(inv.contact_id, req.user.id);
  return { invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id), pay_link: `/pay.html?token=${inv.pay_token}` };
});

app.post('/invoices/:id/paid', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept && !['account', 'hr'].includes(req.user.dept)) {
    return reply.code(403).send({ error: 'Only admin or accounts can mark invoices paid.' });
  }
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(inv.id);
  db.prepare("INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, 'invoice', 'system', ?)")
    .run(req.user.id, inv.contact_id, `Invoice ${inv.number} (${inv.currency} ${Number(inv.total).toLocaleString()} ≈ ₦${Number(inv.ngn_total || inv.total).toLocaleString()}) paid ✅`);
  db.prepare('UPDATE contacts SET debt_ngn = MAX(0, debt_ngn - ?) WHERE id = ? AND user_id = ?').run(inv.ngn_total || inv.total, inv.contact_id, req.user.id);
  return { invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) };
});

// ---- public pay page (no auth; token is unguessable) ----
const PAYSTACK_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const paystackEnabled = () => !!PAYSTACK_KEY;

app.get('/pay/:token', async (req, reply) => {
  const inv = db.prepare(`
    SELECT i.*, c.company, c.name, u.email AS biz_email FROM invoices i
    JOIN contacts c ON c.id = i.contact_id
    JOIN users u ON u.id = i.user_id
    WHERE i.pay_token = ?`).get(req.params.token);
  if (!inv) return reply.code(404).send({ error: 'Invoice link not found' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
  return {
    invoice: { id: inv.id, number: inv.number, company: inv.company || inv.name, status: inv.status, issue_date: inv.issue_date, due_date: inv.due_date, subtotal: inv.subtotal, tax: inv.tax, total: inv.total, fee: inv.fee, fee_rate: inv.fee_rate, currency: inv.currency, fx_rate: inv.fx_rate, ngn_total: inv.ngn_total || inv.total },
    items,
    demo: !paystackEnabled(),
  };
});

app.post('/pay/:token/initialize', async (req, reply) => {
  if (!paystackEnabled()) return reply.code(503).send({ error: 'Paystack is not configured. Use demo-pay.' });
  const inv = db.prepare('SELECT i.*, u.email AS biz_email FROM invoices i JOIN users u ON u.id = i.user_id WHERE i.pay_token = ?').get(req.params.token);
  if (!inv) return reply.code(404).send({ error: 'Invoice link not found' });
  if (inv.status === 'paid') return reply.code(400).send({ error: 'Invoice already paid' });
  // Naira invoices settle in NGN; foreign-currency invoices settle in USD on Paystack's rails.
  const grand = inv.total + (inv.fee || 0);
  let payCurrency = 'NGN';
  let amount = Math.round(grand * 100); // kobo
  if (inv.currency !== 'NGN') {
    payCurrency = 'USD';
    const { rates } = await fxRates();
    const usdRate = rates.USD || FX_FALLBACK.USD;
    amount = Math.round((grand * (inv.fx_rate || 1) / usdRate) * 100); // cents
  }
  const body = JSON.stringify({
    email: inv.biz_email,
    amount,
    currency: payCurrency,
    metadata: { invoice_id: inv.id, pay_token: inv.pay_token, invoice_currency: inv.currency },
    callback_url: `${req.headers.origin || ''}/pay.html?token=${inv.pay_token}`,
  });
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  if (!data.status) return reply.code(502).send({ error: data.message || 'Paystack error' });
  return { authorization_url: data.data.authorization_url, reference: data.data.reference };
});

// DEMO ONLY: auto-marks the invoice paid. Refuses to run when Paystack is configured.
app.post('/pay/:token/demo-pay', async (req, reply) => {
  if (paystackEnabled()) return reply.code(403).send({ error: 'Demo pay disabled — Paystack is live.' });
  const inv = db.prepare('SELECT * FROM invoices WHERE pay_token = ?').get(req.params.token);
  if (!inv) return reply.code(404).send({ error: 'Invoice link not found' });
  if (inv.status === 'paid') return reply.code(400).send({ error: 'Invoice already paid' });
  db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(inv.id);
  db.prepare("INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, 'invoice', 'system', ?)")
    .run(inv.user_id, inv.contact_id, `Invoice ${inv.number} (${inv.currency} ${Number(inv.total).toLocaleString()} ≈ ₦${Number(inv.ngn_total || inv.total).toLocaleString()}) paid via pay link (demo)`);
  db.prepare('UPDATE contacts SET debt_ngn = MAX(0, debt_ngn - ?) WHERE id = ? AND user_id = ?').run(inv.ngn_total || inv.total, inv.contact_id, inv.user_id);
  return { ok: true, status: 'paid', demo: true };
});

// Paystack webhook (HMAC-SHA512 of raw body with the secret key)
app.post('/webhooks/paystack', async (req, reply) => {
  if (!paystackEnabled()) return reply.code(503).send({ error: 'Paystack not configured' });
  const sig = req.headers['x-paystack-signature'];
  const expected = createHmac('sha512', PAYSTACK_KEY).update(req.rawBody || '').digest('hex');
  if (!sig || sig !== expected) return reply.code(401).send({ error: 'Invalid signature' });
  const evt = req.body;
  if (evt.event === 'charge.success') {
    const meta = evt.data?.metadata || {};
    if (meta.invoice_id) {
      db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ? AND status != 'paid'").run(meta.invoice_id);
    }
  }
  return { ok: true };
});

// ---- invoice PDF download ----
const CUR_SYMBOL = { NGN: '₦', USD: '$', EUR: '€', GBP: '£' };
app.get('/invoices/:id/pdf', { preHandler: requireAuth }, async (req, reply) => {
  const inv = db.prepare('SELECT i.*, c.company, c.name, c.phone, c.email, u.name AS biz_name, u.business_name FROM invoices i JOIN contacts c ON c.id = i.contact_id JOIN users u ON u.id = i.user_id WHERE i.id = ? AND i.user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
  const cur = inv.currency;
  const sym = CUR_SYMBOL[cur] || '₦';
  const money = (n) => `${sym}${Number(n).toLocaleString()}`;
  const biz = inv.business_name || inv.biz_name || 'OmniCRM Business';
  const grand = inv.total + (inv.fee || 0);

  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${inv.number}` } });
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `attachment; filename="${inv.number}.pdf"`);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.fontSize(22).font('Helvetica-Bold').text('INVOICE', { characterSpacing: 3 });
  doc.moveDown(0.3).fontSize(11).font('Helvetica').fillColor('#444')
    .text(biz, { align: 'right' }).text('Lagos, Nigeria', { align: 'right' });
  doc.moveDown(0.6);
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#000').text(inv.number);
  doc.fontSize(10).font('Helvetica').fillColor('#555')
    .text(`Issued: ${inv.issue_date}`)
    .text(`Due: ${inv.due_date}`)
    .text(`Status: ${invStatus(inv).toUpperCase()}`);
  doc.moveDown(0.8);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('BILL TO');
  doc.fontSize(10).font('Helvetica').fillColor('#444')
    .text(inv.company || inv.name)
    .text(inv.phone || '')
    .text(inv.email || '');
  doc.moveDown(1.2);

  // items table
  const top = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
  doc.rect(48, top, 499, 18).fill('#0f2319');
  doc.fillColor('#fff').text('Description', 56, top + 5, { width: 250 });
  doc.text('Qty', 306, top + 5, { width: 40, align: 'right' });
  doc.text('Unit', 350, top + 5, { width: 80, align: 'right' });
  doc.text('Amount', 430, top + 5, { width: 109, align: 'right' });
  let y = top + 18;
  doc.font('Helvetica').fillColor('#222');
  for (const it of items) {
    doc.fillColor('#222').fontSize(9.5)
      .text(it.description, 56, y + 5, { width: 250 })
      .text(String(it.qty), 306, y + 5, { width: 40, align: 'right' })
      .text(money(it.unit_price), 350, y + 5, { width: 80, align: 'right' })
      .text(money(it.amount), 430, y + 5, { width: 109, align: 'right' });
    y += 20;
  }
  // totals
  const t = (label, val, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5)
      .text(label, 320, y + 6, { width: 120, align: 'right' })
      .text(val, 440, y + 6, { width: 100, align: 'right' });
    y += 18;
  };
  y += 8;
  t('Subtotal', money(inv.subtotal));
  t('VAT (7.5%)', money(inv.tax));
  if (inv.fee > 0) t(`Processing fee (${(inv.fee_rate * 100).toFixed(1)}%)`, money(inv.fee));
  t('TOTAL', money(grand), true);
  if (cur !== 'NGN') {
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`Naira equivalent @ ${Number(inv.fx_rate).toLocaleString()} ≈ ₦${Number(inv.ngn_total).toLocaleString()}`, 320, y + 2, { width: 220, align: 'right' });
  }
  doc.moveDown(2.5);
  doc.fontSize(9).fillColor('#555')
    .text('Pay online: use the secure payment link sent with this invoice.', { align: 'center' });
  doc.fontSize(8).fillColor('#888')
    .text('Thank you for your business.', { align: 'center' });

  doc.end();
  return reply.send(await done);
});

// ---- feedback (conversation/call notes) ----
app.get('/feedback', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`
    SELECT f.*, c.company, c.name FROM feedback f
    LEFT JOIN contacts c ON c.id = f.contact_id
    WHERE f.user_id = ? ORDER BY f.id DESC LIMIT 100`).all(req.user.id);
  return { feedback: rows };
});

app.post('/feedback', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id, body } = req.body || {};
  if (!body) return reply.code(400).send({ error: 'Feedback text is required' });
  const info = db.prepare('INSERT INTO feedback (user_id, contact_id, body) VALUES (?, ?, ?)')
    .run(req.user.id, contact_id || null, body);
  db.prepare('INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id || null, 'feedback', 'manual', body);
  return { feedback: db.prepare('SELECT * FROM feedback WHERE id = ?').get(info.lastInsertRowid) };
});

app.delete('/feedback/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT id FROM feedback WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Feedback not found' });
  db.prepare('DELETE FROM feedback WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
});

// ---- sales pipeline stages ----
app.get('/pipeline', { preHandler: requireAuth }, async (req) => {
  const stages = ['lead', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
  const rows = db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  const out = stages.map((s) => ({
    stage: s,
    contacts: rows.filter((c) => c.status === s),
    count: rows.filter((c) => c.status === s).length,
    value: rows.filter((c) => c.status === s).reduce((sum, c) => sum + (c.deal_value_ngn || 0), 0),
  }));
  return { stages: out, total: rows.length, pipeline_value: rows.reduce((s, c) => s + (c.deal_value_ngn || 0), 0) };
});

// ---- AI reporting engine (rule-based; compiled on prompt) ----
app.get('/ai/report', { preHandler: requireAuth }, async (req, reply) => {
  const { period, scope } = req.query || {};
  const days = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 }[period] || 1;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const uid = req.user.id;
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const scopes = scope ? [scope] : ['sales', 'support', 'inventory', 'account'];
  const sections = [];
  for (const s of scopes) {
    if (s === 'sales') {
      const activities = q('SELECT * FROM activities WHERE user_id = ? AND created_at >= ? ORDER BY id DESC', uid, since);
      const invs = q('SELECT * FROM invoices WHERE user_id = ? AND created_at >= ?', uid, since);
      const fbs = q('SELECT * FROM feedback WHERE user_id = ? AND created_at >= ?', uid, since);
      const pipe = q('SELECT status, COUNT(*) AS c, SUM(deal_value_ngn) AS v FROM contacts WHERE user_id = ? GROUP BY status', uid);
      const followups = q('SELECT COUNT(*) AS c FROM contacts WHERE user_id = ? AND next_followup_date IS NOT NULL AND next_followup_date <= ?', uid, new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)).map(r => r.c)[0] || 0;
      sections.push({
        scope: 'sales',
        title: '📈 Sales',
        summary: [
          `${activities.length} activities logged`,
          `${invs.length} invoices (${invs.filter((i) => i.status === 'paid').length} paid, ${invs.filter((i) => i.status === 'sent' || i.status === 'overdue').length} outstanding)`,
          `${fbs.length} conversation feedback notes`,
          `Pipeline: ${pipe.map((p) => `${p.status.replace('_', ' ')} ${p.c}`).join(' · ')}`,
          `${followups} follow-ups due in the next 7 days`,
        ],
        rows: activities.map((a) => ({ body: a.body, at: a.created_at })).slice(0, 10),
      });
    } else if (s === 'support') {
      const tkts = q('SELECT * FROM tickets WHERE user_id = ? AND created_at >= ?', uid, since);
      const msgs = q('SELECT * FROM messages WHERE user_id = ? AND created_at >= ?', uid, since);
      const counts = { open: tkts.filter((t) => t.status === 'open').length, pending: tkts.filter((t) => t.status === 'pending').length, closed: tkts.filter((t) => t.status === 'closed').length };
      sections.push({
        scope: 'support',
        title: '🛟 Support',
        summary: [
          `${tkts.length} tickets (${counts.open} open, ${counts.pending} pending, ${counts.closed} closed)`,
          `${msgs.length} WhatsApp messages (${msgs.filter((m) => m.direction === 'in').length} in, ${msgs.filter((m) => m.direction === 'out').length} out)`,
        ],
        rows: tkts.map((t) => ({ body: `${t.priority}: ${t.subject}`, status: t.status })).slice(0, 10),
      });
    } else if (s === 'inventory') {
      const prods = q('SELECT * FROM products WHERE user_id = ?', uid);
      const low = prods.filter((p) => p.stock <= p.low_stock_at);
      const stockValue = prods.reduce((sum, p) => sum + p.stock * p.unit_cost, 0);
      sections.push({
        scope: 'inventory',
        title: '📦 Inventory',
        summary: [
          `${prods.length} SKUs tracked · stock value ₦${Number(stockValue).toLocaleString()} (cost)`,
          `${low.length} low-stock items needing reorder`,
        ],
        rows: low.map((p) => ({ body: `${p.name} — ${p.stock} left (alert at ${p.low_stock_at})`, status: 'low' })).slice(0, 10),
      });
    } else if (s === 'account') {
      const invsAll = q('SELECT * FROM invoices WHERE user_id = ?', uid);
      const fees = invsAll.filter((i) => i.status === 'paid' && i.fee > 0).reduce((sum, i) => sum + i.fee, 0);
      const feesNgn = invsAll.filter((i) => i.status === 'paid' && i.fee > 0).reduce((sum, i) => sum + (i.fee > 0 ? (i.ngn_total || i.total) * (i.fee / (i.total + i.fee)) : 0), 0);
      const receivables = invsAll.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + (i.ngn_total || i.total), 0);
      sections.push({
        scope: 'account',
        title: '👤 Account & Billing',
        summary: [
          `Conversion fees earned (paid invoices): ₦${Number(feesNgn).toLocaleString()}`,
          `Receivables outstanding: ₦${Number(receivables).toLocaleString()}`,
          `Paystack: ${paystackEnabled() ? 'live' : 'demo mode'} · WhatsApp Cloud API: ${waEnabled() ? 'connected' : 'not connected'} · FX: ${FX_CACHE.source === 'live' ? 'live rates' : 'fallback rates'}`,
        ],
        rows: invsAll.filter((i) => i.status === 'paid').slice(0, 10).map((i) => ({ body: `${i.number} paid — ${i.currency} ${Number(i.total).toLocaleString()}`, status: i.currency })),
      });
    }
  }
  return { period, scope: scope || 'all', generated_at: new Date().toISOString(), since, sections };
});

// ---- account section ----
app.get('/account', { preHandler: requireAuth }, async (req) => {
  const u = db.prepare('SELECT id, name, email, business_name, created_at FROM users WHERE id = ?').get(req.user.id);
  const invs = db.prepare('SELECT * FROM invoices WHERE user_id = ?').all(req.user.id);
  const feesEarned = invs.filter((i) => i.status === 'paid' && i.fee > 0)
    .reduce((s, i) => s + (i.ngn_total || i.total) * (i.fee / (i.total + i.fee)), 0);
  const receivables = invs.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + (i.ngn_total || i.total), 0);
  const paidTotal = invs.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.ngn_total || i.total), 0);
  return {
    user: { name: u.name, email: u.email, business_name: u.business_name, member_since: u.created_at },
    plan: 'Starter (free)',
    billing: {
      fees_earned_ngn: Math.round(feesEarned),
      receivables_ngn: Math.round(receivables),
      paid_total_ngn: Math.round(paidTotal),
      invoices_count: invs.length,
      foreign_invoices: invs.filter((i) => i.currency !== 'NGN').length,
    },
    integrations: {
      paystack: paystackEnabled(),
      whatsapp_cloud_api: waEnabled(),
      fx_source: FX_CACHE.source === 'live' ? 'live' : 'fallback',
      currency_fee_rate: FX_FEE_RATE,
    },
  };
});

// ---- WhatsApp Cloud API (inbound webhook + real outbound send when configured) ----
const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || '';
const waEnabled = () => !!(WA_TOKEN && WA_PHONE_ID && WA_VERIFY);

app.get('/webhooks/whatsapp', async (req, reply) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query || {};
  if (WA_VERIFY && mode === 'subscribe' && token === WA_VERIFY) return reply.type('text/plain').send(String(challenge));
  return reply.code(403).send('Verification failed');
});

app.post('/webhooks/whatsapp', async (req, reply) => {
  if (!waEnabled()) return reply.code(503).send({ error: 'WhatsApp Cloud API not configured' });
  for (const e of req.body?.entry || []) {
    for (const ch of e.changes || []) {
      const msg = ch.value?.messages?.[0];
      const from = ch.value?.contacts?.[0];
      if (!msg || msg.type !== 'text') continue;
      const sender = String(from?.wa_id || '');
      const contact = db.prepare("SELECT id FROM contacts WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE ? ORDER BY id LIMIT 1")
        .get(`%${sender}%`);
      if (contact) {
        db.prepare("INSERT INTO messages (user_id, contact_id, direction, body, status, read) VALUES (1, ?, 'in', ?, 'received', 0)")
          .run(contact.id, msg.text?.body || '');
      }
    }
  }
  return { ok: true };
});

// ---- org feature switches (admin) ----
app.get('/org/features', { preHandler: [requireAuth, gate('dashboard')] }, async (req) => {
  return { features: orgFeatures(req.user.id) || {
    dashboard: true, customers: true, inbox: true, invoices: true, followups: true,
    feedback: true, reports: true, ads: true, hr: true, pipeline: true,
    support: true, inventory: true, product: true, account: true,
  } };
});

app.put('/org/features', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept) return reply.code(403).send({ error: 'Only the organization owner can change feature access.' });
  const features = req.body?.features;
  if (!features || typeof features !== 'object') return reply.code(400).send({ error: 'features object is required' });
  db.prepare("INSERT INTO org_settings (user_id, key, value) VALUES (?, 'features', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value")
    .run(req.user.id, JSON.stringify(features));
  return { features };
});

// ---- HR module ----
app.get('/hr-dashboard', { preHandler: [requireAuth, gate('hr')] }, async (req) => {
  const staff = db.prepare('SELECT * FROM staff WHERE user_id = ?').all(req.user.id);
  const payroll = staff.filter((s) => s.status === 'active').reduce((sum, s) => sum + (s.salary || 0), 0);
  const pension = staff.filter((s) => s.status === 'active').reduce((sum, s) => sum + (s.salary || 0) * (s.pension_rate / 100), 0);
  const advances = db.prepare('SELECT * FROM salary_advances WHERE user_id = ?').all(req.user.id);
  const leaves = db.prepare('SELECT * FROM leaves WHERE user_id = ?').all(req.user.id);
  return {
    stats: {
      headcount: staff.filter((s) => s.status === 'active').length,
      monthly_payroll: Math.round(payroll),
      monthly_pension: Math.round(pension),
      pending_advances: advances.filter((a) => a.status === 'pending').reduce((s, a) => s + a.amount, 0),
      pending_advance_count: advances.filter((a) => a.status === 'pending').length,
      open_leaves: leaves.filter((l) => l.status === 'pending').length,
      onboarding_in_progress: staff.filter((s) => s.onboarding !== 'active' && s.status === 'active').length,
    },
    staff,
    advances: advances.map((a) => ({ ...a, name: staff.find((s) => s.id === a.staff_id)?.name })),
    leaves: leaves.map((l) => ({ ...l, name: staff.find((s) => s.id === l.staff_id)?.name })),
  };
});

app.post('/staff', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const { name, email, phone, department, role, salary, bank, pension_rate, hmo_plan, onboarding, next_of_kin, password, commission_rate } = req.body || {};
  if (!name) return reply.code(400).send({ error: 'Staff name is required' });
  const password_hash = password ? bcrypt.hashSync(password, 10) : null;
  const info = db.prepare('INSERT INTO staff (user_id, name, email, phone, department, role, salary, bank, pension_rate, hmo_plan, onboarding, next_of_kin, can_login, password_hash, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, email || null, phone || null, department || 'sales', role || 'Staff', Number(salary) || 0, bank || null, Number(pension_rate ?? 8), hmo_plan || null, onboarding || 'invited', next_of_kin || null, password ? 1 : 0, password_hash, Number(commission_rate ?? 0));
  return { staff: db.prepare('SELECT * FROM staff WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/staff/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM staff WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Staff not found' });
  const c = req.body || {};
  db.prepare('UPDATE staff SET name = ?, email = ?, phone = ?, department = ?, role = ?, salary = ?, bank = ?, pension_rate = ?, hmo_plan = ?, onboarding = ?, status = ?, next_of_kin = ?, commission_rate = ? WHERE id = ? AND user_id = ?')
    .run(c.name ?? existing.name, c.email ?? existing.email, c.phone ?? existing.phone, c.department ?? existing.department, c.role ?? existing.role,
      Number(c.salary ?? existing.salary), c.bank ?? existing.bank, Number(c.pension_rate ?? existing.pension_rate), c.hmo_plan ?? existing.hmo_plan,
      c.onboarding ?? existing.onboarding, c.status ?? existing.status, c.next_of_kin ?? existing.next_of_kin,
      Number(c.commission_rate ?? existing.commission_rate), req.params.id, req.user.id);
  return { staff: db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id) };
});

app.delete('/staff/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const existing = db.prepare('SELECT id FROM staff WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Staff not found' });
  db.prepare('DELETE FROM staff WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
});

app.post('/salary-advances', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const { staff_id, amount, reason } = req.body || {};
  if (!staff_id || !amount) return reply.code(400).send({ error: 'staff_id and amount are required' });
  const info = db.prepare('INSERT INTO salary_advances (user_id, staff_id, amount, reason) VALUES (?, ?, ?, ?)')
    .run(req.user.id, staff_id, Number(amount), reason || null);
  return { advance: db.prepare('SELECT * FROM salary_advances WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/salary-advances/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM salary_advances WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Advance not found' });
  const { status } = req.body || {};
  if (!['pending', 'approved', 'repaid'].includes(status)) return reply.code(400).send({ error: 'status must be pending, approved or repaid' });
  db.prepare('UPDATE salary_advances SET status = ? WHERE id = ? AND user_id = ?').run(status, req.params.id, req.user.id);
  return { advance: db.prepare('SELECT * FROM salary_advances WHERE id = ?').get(req.params.id) };
});

app.post('/leaves', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const { staff_id, type, start_date, end_date } = req.body || {};
  if (!staff_id || !start_date || !end_date) return reply.code(400).send({ error: 'staff_id, start_date and end_date are required' });
  const info = db.prepare('INSERT INTO leaves (user_id, staff_id, type, start_date, end_date) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, staff_id, type || 'annual', start_date, end_date);
  return { leave: db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/leaves/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM leaves WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Leave not found' });
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(status)) return reply.code(400).send({ error: 'status must be pending, approved or rejected' });
  db.prepare('UPDATE leaves SET status = ? WHERE id = ? AND user_id = ?').run(status, req.params.id, req.user.id);
  return { leave: db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id) };
});

// ---- payroll runs + payslips ----
const payeMonthly = (gross) => {
  // Simplified Nigerian PAYE: annualize, reliefs (CRA = 200k + 20% of gross, pension 8%), band tax
  const annual = gross * 12;
  const pensionAnnual = annual * 0.08;
  const cra = 200000 + annual * 0.20;
  const taxable = Math.max(0, annual - pensionAnnual - cra);
  const bands = [[300000, 0.07], [300000, 0.11], [500000, 0.15], [500000, 0.19], [1600000, 0.21], [Infinity, 0.24]];
  let tax = 0, rest = taxable;
  for (const [cap, rate] of bands) {
    if (rest <= 0) break;
    const slice = Math.min(rest, cap);
    tax += slice * rate;
    rest -= slice;
  }
  return Math.round(tax / 12);
};

app.post('/payroll/runs', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const period = req.body?.period || new Date().toISOString().slice(0, 7);
  const existing = db.prepare('SELECT id FROM payroll_runs WHERE user_id = ? AND period = ?').get(req.user.id, period);
  if (existing) return reply.code(400).send({ error: `A payroll run for ${period} already exists.` });
  const staff = db.prepare("SELECT * FROM staff WHERE user_id = ? AND status = 'active'").all(req.user.id);
  // commissions: paid invoices in the period attributed to each sales rep's customers
  const commAgg = db.prepare(`
    SELECT c.staff_id AS sid, COALESCE(SUM(i.ngn_total), 0) AS value
    FROM invoices i JOIN contacts c ON c.id = i.contact_id
    WHERE i.user_id = ? AND i.status = 'paid' AND i.issue_date LIKE ? AND c.staff_id IS NOT NULL
    GROUP BY c.staff_id`).all(req.user.id, `${period}%`);
  const commByStaff = Object.fromEntries(commAgg.map((r) => [r.sid, r.value]));
  let totalGross = 0, totalPension = 0, totalPaye = 0, totalNet = 0, totalComm = 0;
  const info = db.prepare('INSERT INTO payroll_runs (user_id, period) VALUES (?, ?)').run(req.user.id, period);
  const runId = info.lastInsertRowid;
  for (const s of staff) {
    const gross = s.salary;
    const commission = Math.round((commByStaff[s.id] || 0) * ((s.commission_rate || 0) / 100));
    const pension = Math.round(gross * 0.08);
    const paye = payeMonthly(gross);
    const net = gross + commission - pension - paye;
    db.prepare('INSERT INTO payslips (user_id, run_id, staff_id, gross, commission, pension, paye, net) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, runId, s.id, gross, commission, pension, paye, net);
    totalGross += gross; totalPension += pension; totalPaye += paye; totalNet += net; totalComm += commission;
  }
  db.prepare('UPDATE payroll_runs SET total_gross = ?, total_pension = ?, total_paye = ?, total_net = ?, total_commission = ? WHERE id = ?')
    .run(totalGross, totalPension, totalPaye, totalNet, totalComm, runId);
  return { run: db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId), payslips: staff.length };
});

app.get('/payroll/runs', { preHandler: [requireAuth, gate('hr')] }, async (req) => {
  return { runs: db.prepare('SELECT * FROM payroll_runs WHERE user_id = ? ORDER BY id DESC').all(req.user.id) };
});

app.get('/payroll/runs/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!run) return reply.code(404).send({ error: 'Run not found' });
  const slips = db.prepare('SELECT p.*, s.name, s.department, s.role FROM payslips p JOIN staff s ON s.id = p.staff_id WHERE p.run_id = ?').all(run.id);
  return { run, payslips: slips };
});

app.put('/payroll/runs/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!run) return reply.code(404).send({ error: 'Run not found' });
  const { status } = req.body || {};
  if (!['draft', 'approved', 'paid'].includes(status)) return reply.code(400).send({ error: 'status must be draft, approved or paid' });
  db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run(status, run.id);
  if (status === 'paid') {
    db.prepare('UPDATE payslips SET status = ? WHERE run_id = ?').run('paid', run.id);
    // create statutory obligations: PAYE due 10th of next month; pension (staff 8% + employer 10%) due ~7 days after salary payment
    const [y, m] = run.period.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const payeDue = `${nextMonth}-10`;
    const pensionDue = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const employerPension = Math.round(run.total_gross * 0.10);
    const insert = db.prepare('INSERT INTO remittances (user_id, period, type, amount, due_date, run_id) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run(req.user.id, run.period, 'paye', run.total_paye, payeDue, run.id);
    insert.run(req.user.id, run.period, 'pension', run.total_pension + employerPension, pensionDue, run.id);
  }
  return { run: db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(run.id) };
});

// ---- statutory remittance schedule ----
app.get('/remittances', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare('SELECT * FROM remittances WHERE user_id = ? ORDER BY due_date ASC').all(req.user.id);
  const pending = rows.filter((r) => r.status === 'pending');
  return {
    remittances: rows,
    next_due: pending[0] || null,
    pending_total: pending.reduce((s, r) => s + r.amount, 0),
    pending_count: pending.length,
  };
});

app.put('/remittances/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM remittances WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Remittance not found' });
  const { status } = req.body || {};
  if (!['pending', 'paid'].includes(status)) return reply.code(400).send({ error: 'status must be pending or paid' });
  db.prepare('UPDATE remittances SET status = ? WHERE id = ?').run(status, req.params.id);
  return { remittance: db.prepare('SELECT * FROM remittances WHERE id = ?').get(req.params.id) };
});

// ---- accountant journal export (CSV) ----
app.get('/payroll/runs/:id/journal.csv', { preHandler: requireAuth }, async (req, reply) => {
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!run) return reply.code(404).send({ error: 'Run not found' });
  const slips = db.prepare('SELECT p.*, s.name FROM payslips p JOIN staff s ON s.id = p.staff_id WHERE p.run_id = ?').all(run.id);
  const employerPension = Math.round(run.total_gross * 0.10);
  const lines = [];
  lines.push(['Payroll Journal', run.period, `Run #${run.id}`, run.status].join(','));
  lines.push('');
  lines.push('Staff,Gross,Staff Pension (8%),PAYE,Net Pay');
  for (const s of slips) lines.push([s.name, s.gross, s.pension, s.paye, s.net].join(','));
  lines.push('');
  lines.push(`TOTALS,${run.total_gross},${run.total_pension},${run.total_paye},${run.total_net}`);
  lines.push(`Employer pension (10%),${employerPension},,,`);
  lines.push('');
  lines.push('Journal Entries');
  lines.push(`Dr Salaries expense,${run.total_gross},,`);
  lines.push(`Cr PAYE payable,,${run.total_paye},`);
  lines.push(`Cr Pension payable,,${run.total_pension + employerPension},`);
  lines.push(`Cr Bank / Net pay,,,${run.total_net}`);
  reply.header('Content-Type', 'text/csv');
  reply.header('Content-Disposition', `attachment; filename="payroll-journal-${run.period}.csv"`);
  return lines.join('\n');
});

// ---- shift roster ----
app.get('/shifts', { preHandler: requireAuth }, async (req) => {
  const start = req.query?.start || new Date().toISOString().slice(0, 10);
  const end = req.query?.end || new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  const rows = db.prepare('SELECT sh.*, s.name, s.department FROM shifts sh JOIN staff s ON s.id = sh.staff_id WHERE sh.user_id = ? AND sh.date BETWEEN ? AND ? ORDER BY sh.date, s.name').all(req.user.id, start, end);
  return { start, end, shifts: rows };
});

app.put('/shifts', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const { staff_id, date, shift } = req.body || {};
  if (!staff_id || !date || !shift) return reply.code(400).send({ error: 'staff_id, date and shift are required' });
  if (!['morning', 'afternoon', 'night', 'off'].includes(shift)) return reply.code(400).send({ error: 'shift must be morning, afternoon, night or off' });
  db.prepare('INSERT INTO shifts (user_id, staff_id, date, shift) VALUES (?, ?, ?, ?) ON CONFLICT(staff_id, date) DO UPDATE SET shift = excluded.shift')
    .run(req.user.id, staff_id, date, shift);
  return { ok: true };
});

app.get('/me/shifts', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.staff_id) return reply.code(403).send({ error: 'Staff only' });
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  const rows = db.prepare('SELECT * FROM shifts WHERE staff_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(req.user.staff_id, start, end);
  return { shifts: rows };
});

// ---- health ----

app.get('/payslips/:id/pdf', { preHandler: requireAuth }, async (req, reply) => {
  const slip = db.prepare('SELECT p.*, s.name, s.role, s.department, s.bank, r.period FROM payslips p JOIN staff s ON s.id = p.staff_id JOIN payroll_runs r ON r.id = p.run_id WHERE p.id = ?').get(req.params.id);
  if (!slip) return reply.code(404).send({ error: 'Payslip not found' });
  // owner OR the staff member themselves
  if (req.user.dept && req.user.staff_id !== slip.staff_id) return reply.code(403).send({ error: 'Not your payslip' });
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `attachment; filename="Payslip-${slip.period}-${slip.name.replace(/\s+/g, '-')}.pdf"`);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.fontSize(20).font('Helvetica-Bold').text('PAYSLIP', { characterSpacing: 2 });
  doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('#444').text(`Period: ${slip.period}`, { align: 'right' });
  doc.moveDown(0.6);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text(slip.name);
  doc.fontSize(10).font('Helvetica').fillColor('#555').text(`${slip.role} · ${slip.department} · ${slip.bank || ''}`);
  doc.moveDown(1);
  const rows = [
    ['Gross salary', slip.gross, false],
    ['Commission', slip.commission || 0, false],
    ['Pension (8% staff)', slip.pension, true],
    ['PAYE tax', slip.paye, true],
    ['Other deductions', slip.other_deductions, true],
    ['NET PAY', slip.net, false],
  ];
  let y = doc.y;
  for (const [label, val, minus] of rows) {
    doc.fontSize(10).font(minus ? 'Helvetica' : 'Helvetica-Bold').fillColor(minus ? '#555' : '#000')
      .text(label, 56, y)
      .text(`${minus ? '−' : ''}₦${Number(val).toLocaleString()}`, 400, y, { width: 130, align: 'right' });
    y += 22;
  }
  doc.moveDown(2).fontSize(8).fillColor('#888').text('Simplified PAYE — generated by OmniCRM. This is a demo payslip.', { align: 'center' });
  doc.end();
  return reply.send(await done);
});

// ---- staff self-service portal ----
app.get('/me/portal', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.staff_id) return reply.code(403).send({ error: 'Staff only' });
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.user.staff_id);
  if (!staff) return reply.code(404).send({ error: 'Staff record not found' });
  const payslips = db.prepare('SELECT p.*, r.period FROM payslips p JOIN payroll_runs r ON r.id = p.run_id WHERE p.staff_id = ? ORDER BY p.id DESC').all(staff.id);
  const advances = db.prepare('SELECT * FROM salary_advances WHERE staff_id = ? ORDER BY id DESC').all(staff.id);
  const leaves = db.prepare('SELECT * FROM leaves WHERE staff_id = ? ORDER BY id DESC').all(staff.id);
  const today = new Date().toISOString().slice(0, 10);
  const attendance = db.prepare('SELECT * FROM attendance WHERE staff_id = ? AND date = ?').all(staff.id, today);
  return { staff, payslips, advances, leaves, today_attendance: attendance };
});

app.post('/me/advances', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.staff_id) return reply.code(403).send({ error: 'Staff only' });
  const { amount, reason } = req.body || {};
  if (!amount) return reply.code(400).send({ error: 'amount is required' });
  const info = db.prepare('INSERT INTO salary_advances (user_id, staff_id, amount, reason) VALUES (?, ?, ?, ?)')
    .run(req.user.id, req.user.staff_id, Number(amount), reason || null);
  return { advance: db.prepare('SELECT * FROM salary_advances WHERE id = ?').get(info.lastInsertRowid) };
});

app.post('/me/leaves', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.staff_id) return reply.code(403).send({ error: 'Staff only' });
  const { type, start_date, end_date } = req.body || {};
  if (!start_date || !end_date) return reply.code(400).send({ error: 'start_date and end_date are required' });
  const info = db.prepare('INSERT INTO leaves (user_id, staff_id, type, start_date, end_date) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, req.user.staff_id, type || 'annual', start_date, end_date);
  return { leave: db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid) };
});

// ---- attendance / clock-in ----
app.get('/attendance', { preHandler: requireAuth }, async (req) => {
  const date = req.query?.date || new Date().toISOString().slice(0, 10);
  const rows = db.prepare('SELECT a.*, s.name, s.department FROM attendance a JOIN staff s ON s.id = a.staff_id WHERE a.user_id = ? AND a.date = ? ORDER BY a.id DESC').all(req.user.id, date);
  return { date, attendance: rows };
});

app.post('/attendance/clock-in', { preHandler: requireAuth }, async (req, reply) => {
  const staffId = req.user.staff_id || req.body?.staff_id;
  if (!staffId) return reply.code(400).send({ error: 'staff_id is required' });
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM attendance WHERE staff_id = ? AND date = ?').get(staffId, today);
  if (existing && existing.clock_in) return reply.code(400).send({ error: 'Already clocked in today' });
  const now = new Date().toISOString().slice(11, 16);
  if (existing) {
    db.prepare('UPDATE attendance SET clock_in = ? WHERE id = ?').run(now, existing.id);
    return { attendance: db.prepare('SELECT * FROM attendance WHERE id = ?').get(existing.id) };
  }
  const staff = db.prepare('SELECT user_id FROM staff WHERE id = ?').get(staffId);
  const info = db.prepare('INSERT INTO attendance (user_id, staff_id, date, clock_in) VALUES (?, ?, ?, ?)')
    .run(staff.user_id, staffId, today, now);
  return { attendance: db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid) };
});

app.post('/attendance/clock-out', { preHandler: requireAuth }, async (req, reply) => {
  const staffId = req.user.staff_id || req.body?.staff_id;
  if (!staffId) return reply.code(400).send({ error: 'staff_id is required' });
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM attendance WHERE staff_id = ? AND date = ?').get(staffId, today);
  if (!existing || !existing.clock_in) return reply.code(400).send({ error: 'Not clocked in today' });
  db.prepare('UPDATE attendance SET clock_out = ? WHERE id = ?').run(new Date().toISOString().slice(11, 16), existing.id);
  return { attendance: db.prepare('SELECT * FROM attendance WHERE id = ?').get(existing.id) };
});

// ---- revocable demo links ----
app.get('/demo/:token', async (req, reply) => {
  const row = db.prepare('SELECT * FROM demo_links WHERE token = ?').get(req.params.token);
  if (!row || !row.active) return reply.code(403).send({ error: 'This demo link is no longer active.' });
  return { ok: true, label: row.label };
});

app.get('/demo-links', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare('SELECT * FROM demo_links WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  return { links: rows };
});

app.post('/demo-links', { preHandler: requireAuth }, async (req, reply) => {
  const { label } = req.body || {};
  const token = `${randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const info = db.prepare('INSERT INTO demo_links (user_id, token, label) VALUES (?, ?, ?)').run(req.user.id, token, label || null);
  return { link: db.prepare('SELECT * FROM demo_links WHERE id = ?').get(info.lastInsertRowid), url: `/demo.html?token=${token}` };
});

app.delete('/demo-links/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM demo_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Link not found' });
  db.prepare("UPDATE demo_links SET active = 0, revoked_at = datetime('now') WHERE id = ?").run(req.params.id);
  return { ok: true, revoked: existing.label || existing.token };
});

app.get('/me/contacts', { preHandler: requireAuth }, async (req) => {
  const isOps = !req.user.dept || req.user.dept === 'account' || req.user.dept === 'hr';
  const rows = db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY company').all(req.user.id)
    .filter((c) => isOps || c.staff_id === req.user.staff_id);
  return { rows };
});

// internal mail / stock / receipts use the same ops gate as orders — declare it up front
const isOps = (u) => !u.dept || u.dept === 'account' || u.dept === 'hr';
const notify = (userId, staffId, kind, message, link) => {
  db.prepare('INSERT INTO notifications (user_id, staff_id, kind, message, link_json) VALUES (?, ?, ?, ?, ?)')
    .run(userId || null, staffId || null, kind, message, link ? JSON.stringify(link) : null);
};

// ---- internal mail (teams): threads, @mentions, and an order/approve/payment stream ----
const staffName = (id) => id ? (db.prepare('SELECT name FROM staff WHERE id = ?').get(id)?.name || null) : null;

// ---- modern chat interface: conversations (DMs + group channels) ----
const myChats = (userId, staffId) => {
  // all group channels + DMs where the staff is a member
  const convos = db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY id ASC').all(userId);
  return convos.filter((c) => {
    if (c.kind === 'group') return true;           // everyone sees group channels
    const members = JSON.parse(c.member_json || '[]');
    return members.includes(staffId);              // DM only to its two members
  }).map((c) => ({
    ...c,
    members: JSON.parse(c.member_json || '[]'),
    // last message preview
    last: db.prepare('SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(c.id),
  }));
};

app.get('/chat/conversations', { preHandler: requireAuth }, async (req) => {
  const staffList = db.prepare('SELECT id, name, department, role FROM staff WHERE user_id = ? ORDER BY name').all(req.user.id);
  return { conversations: myChats(req.user.id, req.user.staff_id), staff: staffList };
});

app.get('/chat/conversations/:id', { preHandler: requireAuth }, async (req, reply) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Conversation not found' });
  const members = JSON.parse(c.member_json || '[]');
  if (c.kind === 'dm' && !members.includes(req.user.staff_id) && !isOps(req.user)) {
    return reply.code(403).send({ error: 'Not in this conversation' });
  }
  const messages = db.prepare('SELECT m.*, s.name AS sender_name FROM conversation_messages m LEFT JOIN staff s ON s.id = m.sender_staff_id WHERE m.conversation_id = ? ORDER BY m.id ASC').all(c.id)
    .map((m) => ({ ...m, mentions: JSON.parse(m.mentions_json || '[]'), groups: JSON.parse(m.groups_json || '[]') }));
  return { conversation: { ...c, members }, messages };
});

// create a DM with another staff, or a group channel
app.post('/chat/conversations', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const { kind, with_staff_id, title, members } = req.body || {};
  if (kind === 'dm') {
    if (!with_staff_id) return reply.code(400).send({ error: 'with_staff_id required for DM' });
    if (with_staff_id === req.user.staff_id) return reply.code(400).send({ error: 'Cannot DM yourself' });
    const other = db.prepare('SELECT id, name FROM staff WHERE id = ? AND user_id = ?').get(with_staff_id, req.user.id);
    if (!other) return reply.code(404).send({ error: 'Staff not found' });
    const mem = JSON.stringify([req.user.staff_id, with_staff_id].filter(Boolean).sort((a, b) => a - b));
    // reuse existing DM if present
    const existing = db.prepare('SELECT * FROM conversations WHERE user_id = ? AND kind = ? AND member_json = ?').get(req.user.id, 'dm', mem);
    if (existing) return { ok: true, id: existing.id, reused: true };
    const info = db.prepare('INSERT INTO conversations (user_id, kind, title, member_json) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'dm', other.name, mem);
    return { ok: true, id: info.lastInsertRowid };
  }
  // group channel
  const memArr = Array.isArray(members) ? members : [];
  const info = db.prepare('INSERT INTO conversations (user_id, kind, title, member_json) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'group', title || 'Group', JSON.stringify(memArr));
  return { ok: true, id: info.lastInsertRowid };
});

app.post('/chat/conversations/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const c = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Conversation not found' });
  const { body, mentions, groups } = req.body || {};
  if (!body || !body.trim()) return reply.code(400).send({ error: 'Message body is required' });
  const mentionsArr = Array.isArray(mentions) ? mentions : [];
  const groupsArr = Array.isArray(groups) ? groups : [];
  const resolved = [...mentionsArr];
  for (const g of groupsArr) {
    const mm = db.prepare('SELECT id FROM staff WHERE user_id = ? AND department = ? AND can_login = 1').all(req.user.id, g);
    for (const m of mm) if (!resolved.includes(m.id)) resolved.push(m.id);
  }
  const info = db.prepare('INSERT INTO conversation_messages (conversation_id, sender_staff_id, body, mentions_json, groups_json) VALUES (?, ?, ?, ?, ?)')
    .run(c.id, req.user.staff_id || null, body, JSON.stringify(resolved), JSON.stringify(groupsArr));
  // notify mentioned
  for (const sid of resolved) {
    if (sid === req.user.staff_id) continue;
    const mentioned = db.prepare('SELECT name FROM staff WHERE id = ?').get(sid);
    const first = mentioned ? mentioned.name.split(' ')[0] : '';
    // strip the raw "@Firstname" token the mention picker leaves in the body, so the preview reads naturally
    const cleanBody = first ? body.replace(new RegExp('@' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').replace(/\s{2,}/g, ' ').trim() : body;
    notify(req.user.id, sid, 'mention', `${req.user.name || 'Someone'} mentioned you${groupsArr.length ? ' (' + groupsArr.join(', ') + ')' : ''}: ${cleanBody.slice(0, 120)}`, { view: 'mail', id: c.id });
  }
  return { ok: true, id: info.lastInsertRowid };
});

// seed a "General" group channel on first access if none exists
app.get('/chat/ensure-general', { preHandler: requireAuth }, async (req) => {
  const has = db.prepare("SELECT id FROM conversations WHERE user_id = ? AND kind = 'group' AND title = 'General'").get(req.user.id);
  if (!has) {
    const staffIds = db.prepare('SELECT id FROM staff WHERE user_id = ?').all(req.user.id).map((s) => s.id);
    db.prepare("INSERT INTO conversations (user_id, kind, title, member_json) VALUES (?, 'group', 'General', ?)")
      .run(req.user.id, JSON.stringify(staffIds));
  }
  return { conversations: myChats(req.user.id, req.user.staff_id) };
});

app.get('/mail/threads', { preHandler: requireAuth }, async (req) => {
  // everyone in the org sees the org's team threads (scoped messaging is per-invoice, enforced at the order/invoice layer)
  const threads = db.prepare('SELECT * FROM mail_threads WHERE user_id = ? ORDER BY pinned DESC, id DESC LIMIT 60').all(req.user.id);
  return { threads };
});

app.get('/mail/threads/:id', { preHandler: requireAuth }, async (req) => {
  const t = db.prepare('SELECT * FROM mail_threads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!t) return reply.code(404).send({ error: 'Thread not found' });
  const messages = db.prepare('SELECT m.*, s.name AS sender_name FROM mail_messages m LEFT JOIN staff s ON s.id = m.sender_staff_id WHERE m.thread_id = ? ORDER BY m.id ASC').all(t.id)
    .map((m) => ({ ...m, mentions: JSON.parse(m.mentions_json || '[]'), groups: JSON.parse(m.groups_json || '[]') }));
  return { thread: t, messages };
});

app.post('/mail/threads', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const { subject, kind, ref_id } = req.body || {};
  const info = db.prepare('INSERT INTO mail_threads (user_id, subject, kind, ref_id) VALUES (?, ?, ?, ?)')
    .run(req.user.id, subject || null, kind || 'note', ref_id || null);
  return { ok: true, id: info.lastInsertRowid };
});

app.post('/mail/threads/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const t = db.prepare('SELECT * FROM mail_threads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!t) return reply.code(404).send({ error: 'Thread not found' });
  const { body, mentions, groups } = req.body || {};
  if (!body || !body.trim()) return reply.code(400).send({ error: 'Message body is required' });
  const mentionsArr = Array.isArray(mentions) ? mentions : [];
  const groupsArr = Array.isArray(groups) ? groups : [];
  // resolve group tags (@sales, @account, @inventory, @support, @hr) to staff ids
  const resolved = [...mentionsArr];
  for (const g of groupsArr) {
    const members = db.prepare('SELECT id FROM staff WHERE user_id = ? AND department = ? AND can_login = 1').all(req.user.id, g);
    for (const m of members) if (!resolved.includes(m.id)) resolved.push(m.id);
  }
  const info = db.prepare('INSERT INTO mail_messages (thread_id, sender_staff_id, body, mentions_json, groups_json) VALUES (?, ?, ?, ?, ?)')
    .run(t.id, req.user.staff_id || null, body, JSON.stringify(resolved), JSON.stringify(groupsArr));
  for (const sid of resolved) {
    if (sid === req.user.staff_id) continue;
    const userName = req.user.name || 'Someone';
    const mentioned = db.prepare('SELECT name FROM staff WHERE id = ?').get(sid);
    const first = mentioned ? mentioned.name.split(' ')[0] : '';
    const cleanBody = first ? body.replace(new RegExp('@' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').replace(/\s{2,}/g, ' ').trim() : body;
    notify(req.user.id, sid, 'mention', `${userName} mentioned you${groupsArr.length ? ' (' + groupsArr.join(', ') + ')' : ''}: ${cleanBody.slice(0, 120)}`, { view: 'mail', id: t.id });
  }
  return { ok: true, id: info.lastInsertRowid };
});

app.get('/staff/mentions', { preHandler: requireAuth }, async (req) => {
  const staff = db.prepare('SELECT id, name, department FROM staff WHERE user_id = ? AND can_login = 1 ORDER BY name').all(req.user.id);
  const groups = ['sales', 'support', 'inventory', 'hr', 'account'];
  return { staff, groups };
});

// stock posts: inventory team posts daily levels; sales reps read them before raising orders
app.get('/stock', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare('SELECT sp.*, s.name AS poster FROM stock_posts sp LEFT JOIN staff s ON s.id = sp.posted_by WHERE sp.user_id = ? ORDER BY sp.id DESC LIMIT 60').all(req.user.id);
  return { posts: rows };
});

app.post('/stock', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const { product_name, qty_on_hand, note } = req.body || {};
  if (!product_name || qty_on_hand == null) return reply.code(400).send({ error: 'product_name and qty_on_hand required' });
  const info = db.prepare('INSERT INTO stock_posts (user_id, product_name, qty_on_hand, posted_by, note) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, product_name, Number(qty_on_hand), req.user.staff_id || null, note || null);
  // notify sales reps there's a fresh stock update
  const reps = db.prepare("SELECT id FROM staff WHERE user_id = ? AND department = 'sales' AND can_login = 1").all(req.user.id);
  for (const r of reps) notify(req.user.id, r.id, 'stock_update', `Stock updated: ${product_name} — ${Number(qty_on_hand)} on hand.`, { view: 'dashboard', dept: 'inventory' });
  return { ok: true, id: info.lastInsertRowid };
});

// payment receipts: rep uploads proof (with optional photo) when a customer pays from another account
app.post('/receipts', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const { contact_id, payer_name, amount_ngn, note, receipt_name, receipt_body, image_data_url } = req.body || {};
  if (!contact_id || !payer_name) return reply.code(400).send({ error: 'contact_id and payer_name are required' });
  const info = db.prepare('INSERT INTO payment_receipts (user_id, contact_id, staff_id, payer_name, amount_ngn, note, receipt_name, receipt_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, req.user.staff_id || null, payer_name, amount_ngn || null, note || null, receipt_name || null, null);
  // persist the receipt photo (data URL) to disk
  let file = null;
  if (image_data_url && typeof image_data_url === 'string' && image_data_url.startsWith('data:image/')) {
    const m = image_data_url.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!m) return reply.code(400).send({ error: 'Invalid image format' });
    const [, mime, b64] = m;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 8 * 1024 * 1024) return reply.code(413).send({ error: 'Image too large (max 8MB)' });
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    file = `receipt-${info.lastInsertRowid}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
    db.prepare('UPDATE payment_receipts SET receipt_body = ? WHERE id = ?').run(file, info.lastInsertRowid);
  }
  const c = db.prepare('SELECT company FROM contacts WHERE id = ?').get(contact_id);
  notify(req.user.id, null, 'receipt', `New payment receipt from ${payer_name} (${c?.company || 'customer'})${file ? ' with photo' : ''} awaits matching by accounts.`, { view: 'invoices', id: info.lastInsertRowid });
  return { ok: true, id: info.lastInsertRowid, has_image: !!file };
});

app.get('/receipts/:id/image', { preHandler: requireAuth }, async (req, reply) => {
  const r = db.prepare('SELECT * FROM payment_receipts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!r) return reply.code(404).send({ error: 'Receipt not found' });
  if (!isOps(req.user) && r.staff_id !== req.user.staff_id) return reply.code(403).send({ error: 'Not your receipt' });
  if (!r.receipt_body) return reply.code(404).send({ error: 'No image attached' });
  const p = path.join(UPLOAD_DIR, r.receipt_body);
  if (!fs.existsSync(p)) return reply.code(404).send({ error: 'Image missing' });
  const ext = path.extname(p).slice(1);
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return reply.header('Content-Type', mime).header('Cache-Control', 'private, max-age=300').send(fs.readFileSync(p));
});

app.get('/receipts', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare('SELECT r.*, c.company, c.name AS contact_name, s.name AS rep_name FROM payment_receipts r LEFT JOIN contacts c ON c.id = r.contact_id LEFT JOIN staff s ON s.id = r.staff_id WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 60').all(req.user.id)
    .filter((r) => isOps(req.user) || r.staff_id === req.user.staff_id);
  return { rows };
});

app.post('/receipts/:id/match', { preHandler: requireAuth }, async (req, reply) => {
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin/accountant/HR can match receipts' });
  const r = db.prepare('SELECT * FROM payment_receipts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!r) return reply.code(404).send({ error: 'Receipt not found' });
  const { invoice_id } = req.body || {};
  db.prepare('UPDATE payment_receipts SET status = ?, matched_invoice_id = ? WHERE id = ?').run('matched', invoice_id || null, r.id);
  if (invoice_id) {
    db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ? AND user_id = ?").run(invoice_id, req.user.id);
    const inv = db.prepare('SELECT contact_id, ngn_total FROM invoices WHERE id = ?').get(invoice_id);
    const order = db.prepare('SELECT id FROM orders WHERE invoice_id = ?').get(invoice_id);
    if (order) {
      db.prepare("UPDATE orders SET status = 'paid', payment_ref = ?, paid_at = datetime('now') WHERE id = ?").run(`receipt-${r.id}`, order.id);
      notify(req.user.id, r.staff_id, 'payment_received', `Payment matched for invoice #${invoice_id} — receipt from ${r.payer_name}.`, { view: 'invoices', id: invoice_id });
    }
  }
  return { ok: true };
});

// ---- sales order workflow: reps raise orders, ops approves -> invoice -> delivery -> payment ----
app.get('/orders', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`SELECT o.*, c.company, c.name AS contact_name, s.name AS rep_name
    FROM orders o LEFT JOIN contacts c ON c.id = o.contact_id LEFT JOIN staff s ON s.id = o.staff_id
    WHERE o.user_id = ? ORDER BY o.id DESC`).all(req.user.id)
    .filter((o) => isOps(req.user) || o.staff_id === req.user.staff_id);
  return { rows };
});

app.post('/orders', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const { contact_id, items, note, kind, payment_terms, description, amount_ngn } = req.body || {};
  if (!contact_id) return reply.code(400).send({ error: 'contact_id is required' });
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Customer not found' });
  // attribute to the rep who owns this customer (or the logged-in rep)
  const staffId = req.user.staff_id || contact.staff_id || null;
  const orderKind = kind === 'custom' ? 'custom' : 'catalog';
  let itemsArr, total;
  if (orderKind === 'custom') {
    // customized order: free-form description + optional estimate value
    total = Number(amount_ngn) || 0;
    itemsArr = [{ name: description || 'Custom work', qty: 1, price: total }];
  } else {
    itemsArr = Array.isArray(items) ? items : [];
    if (!itemsArr.length) return reply.code(400).send({ error: 'Add at least one catalog item' });
    // auto-price catalog items from the product table (price comes from the CRM, not the rep)
    total = 0;
    for (const it of itemsArr) {
      const prod = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(it.product_id, req.user.id);
      if (!prod) return reply.code(404).send({ error: `Product ${it.product_id} not found` });
      const price = Number(prod.unit_price) || 0;
      const qty = Number(it.qty) || 0;
      it.name = prod.name;
      it.price = price;
      it.sku = prod.sku;
      total += price * qty;
    }
  }
  const info = db.prepare(`INSERT INTO orders (user_id, staff_id, contact_id, items_json, total_ngn, status, note, kind, payment_terms)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
    .run(req.user.id, staffId, contact_id, JSON.stringify(itemsArr), total, note || null, orderKind, payment_terms || null);
  const rep = staffId ? db.prepare('SELECT name FROM staff WHERE id = ?').get(staffId) : null;
  notify(req.user.id, null, 'order_raised',
    `New order #${info.lastInsertRowid} for ${contact.company || contact.name} (${total.toLocaleString()} naira)${rep ? ' from ' + rep.name : ''} awaits approval.`,
    { view: 'orders', id: info.lastInsertRowid });
  return { ok: true, id: info.lastInsertRowid };
});

app.post('/orders/:id/approve', { preHandler: requireAuth }, async (req, reply) => {
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin/accountant/HR can approve orders' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return reply.code(404).send({ error: 'Order not found' });
  if (o.status !== 'pending') return reply.code(400).send({ error: `Order is already ${o.status}` });
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(o.contact_id);
  const items = JSON.parse(o.items_json);
  // auto-raise the invoice (draft -> visible to the rep when delivered)
  const n = db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE user_id = ?').get(req.user.id).c;
  const number = `INV-2026-${String(n + 1).padStart(3, '0')}`;
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const inv = db.prepare(`INSERT INTO invoices (user_id, contact_id, number, status, issue_date, due_date, subtotal, total, tax_rate, tax, currency, fx_rate, ngn_total)
    VALUES (?, ?, ?, 'draft', date('now'), ?, ?, ?, 7.5, ?, 'NGN', 1, ?)`)
    .run(req.user.id, o.contact_id, number, due, o.total_ngn, o.total_ngn * 1.075, o.total_ngn * 0.075, o.total_ngn);
  for (const it of items) {
    db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, amount) VALUES (?, ?, ?, ?, ?)')
      .run(inv.lastInsertRowid, it.name, it.qty, it.price, (Number(it.price) || 0) * (Number(it.qty) || 0));
  }
  db.prepare("UPDATE orders SET status = 'approved', invoice_id = ?, approved_at = datetime('now') WHERE id = ?")
    .run(inv.lastInsertRowid, o.id);
  notify(o.user_id, o.staff_id, 'order_approved',
    `Order #${o.id} approved — invoice ${number} raised for ${contact.company || contact.name}.`,
    { view: 'orders', id: o.id });
  return { ok: true, invoice: number };
});

app.post('/orders/:id/reject', { preHandler: requireAuth }, async (req, reply) => {
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin/accountant/HR can reject orders' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return reply.code(404).send({ error: 'Order not found' });
  db.prepare("UPDATE orders SET status = 'rejected' WHERE id = ?").run(o.id);
  notify(o.user_id, o.staff_id, 'order_rejected', `Order #${o.id} was rejected.`, { view: 'orders', id: o.id });
  return { ok: true };
});

app.post('/orders/:id/deliver', { preHandler: requireAuth }, async (req, reply) => {
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin/accountant/HR can mark delivery' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return reply.code(404).send({ error: 'Order not found' });
  if (o.status !== 'approved') return reply.code(400).send({ error: `Cannot deliver an order that is ${o.status}` });
  db.prepare("UPDATE orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(o.id);
  if (o.invoice_id) db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(o.invoice_id);
  notify(o.user_id, o.staff_id, 'order_delivered',
    `Order #${o.id} delivered — your invoice ${o.invoice_id ? '#' + o.invoice_id : ''} is now visible in your portal.`,
    { view: 'orders', id: o.id });
  return { ok: true };
});

app.post('/orders/:id/payment', { preHandler: requireAuth }, async (req, reply) => {
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin/accountant/HR can post payments' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return reply.code(404).send({ error: 'Order not found' });
  const { ref } = req.body || {};
  db.prepare("UPDATE orders SET status = 'paid', payment_ref = ?, paid_at = datetime('now') WHERE id = ?").run(ref || null, o.id);
  if (o.invoice_id) db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(o.invoice_id);
  notify(o.user_id, o.staff_id, 'payment_received',
    `Payment received for order #${o.id} (${o.total_ngn.toLocaleString()} naira)${ref ? ' — ref ' + ref : ''}.`,
    { view: 'orders', id: o.id });
  return { ok: true };
});

app.get('/notifications', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`SELECT * FROM notifications
    WHERE (staff_id = ? OR (staff_id IS NULL AND user_id = ?)) ORDER BY id DESC LIMIT 40`)
    .all(req.user.staff_id || null, req.user.id)
    .map((n) => ({ ...n, link: n.link_json ? JSON.parse(n.link_json) : null }));
  return { rows };
});

app.post('/notifications/read', { preHandler: requireAuth }, async (req) => {
  const { id } = req.body || {};
  if (id) db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  else db.prepare('UPDATE notifications SET read = 1 WHERE staff_id = ?').run(req.user.staff_id || null);
  return { ok: true };
});

// ---- commissions calculator (HR sees all; sales staff see their own) ----
app.get('/commissions', { preHandler: requireAuth }, async (req) => {
  const isHr = !req.user.dept || req.user.dept === 'hr';
  const staff = db.prepare('SELECT * FROM staff WHERE user_id = ?').all(req.user.id)
    .filter((s) => isHr || s.id === req.user.staff_id);
  const period = new Date().toISOString().slice(0, 7);
  const rows = staff.map((s) => {
    const allTime = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(i.ngn_total), 0) AS v
      FROM invoices i JOIN contacts c ON c.id = i.contact_id
      WHERE i.user_id = ? AND i.status = 'paid' AND c.staff_id = ?`).get(req.user.id, s.id);
    const thisPeriod = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(i.ngn_total), 0) AS v
      FROM invoices i JOIN contacts c ON c.id = i.contact_id
      WHERE i.user_id = ? AND i.status = 'paid' AND c.staff_id = ? AND i.issue_date LIKE ?`).get(req.user.id, s.id, `${period}%`);
    const rate = s.commission_rate || 0;
    return {
      staff_id: s.id, name: s.name, department: s.department, rate,
      period: { paid_invoices: thisPeriod.n, sales_value: thisPeriod.v, commission: Math.round(thisPeriod.v * rate / 100) },
      all_time: { paid_invoices: allTime.n, sales_value: allTime.v, commission: Math.round(allTime.v * rate / 100) },
    };
  });
  return { period, rows };
});

// ---- health ----
app.get('/health', async () => ({ ok: true, service: 'omnicrm-api', time: new Date().toISOString() }));

const PORT = process.env.PORT || 4200;
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`OmniCRM API running on http://localhost:${PORT}`);
});
