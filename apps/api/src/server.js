// OmniCRM API — auth, contacts, deals, dashboard, AI follow-up engine (v0.1)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import db from './db.js';

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
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email, name: user.name, business_name: user.business_name } };
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
  if (!c.name) return reply.code(400).send({ error: 'name is required' });
  const info = db.prepare(`INSERT INTO contacts (user_id, name, company, phone, email, tags, status, debt_ngn, deal_value_ngn, next_action, next_followup_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, c.name, c.company || null, c.phone || null, c.email || null, c.tags || 'lead', c.status || 'new',
      c.debt_ngn || 0, c.deal_value_ngn || 0, c.next_action || null, c.next_followup_date || null);
  return { contact: db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/contacts/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Contact not found' });
  const c = req.body || {};
  db.prepare('UPDATE contacts SET name = ?, company = ?, phone = ?, email = ?, tags = ?, status = ?, debt_ngn = ?, deal_value_ngn = ? WHERE id = ? AND user_id = ?')
    .run(c.name ?? existing.name, c.company ?? existing.company, c.phone ?? existing.phone, c.email ?? existing.email, c.tags ?? existing.tags, c.status ?? existing.status,
      Number(c.debt_ngn ?? existing.debt_ngn), Number(c.deal_value_ngn ?? existing.deal_value_ngn), req.params.id, req.user.id);
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
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(inv.id);
  db.prepare("INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, 'invoice', 'system', ?)")
    .run(req.user.id, inv.contact_id, `Invoice ${inv.number} (₦${Number(inv.total).toLocaleString()}) sent to customer`);
  db.prepare("UPDATE contacts SET last_contacted_at = datetime('now') WHERE id = ? AND user_id = ?").run(inv.contact_id, req.user.id);
  return { invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id), pay_link: `/pay.html?token=${inv.pay_token}` };
});

app.post('/invoices/:id/paid', { preHandler: requireAuth }, async (req, reply) => {
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
  doc.pipe(reply.raw);

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
  const { name, email, phone, department, role, salary, bank, pension_rate, hmo_plan, onboarding, next_of_kin, password } = req.body || {};
  if (!name) return reply.code(400).send({ error: 'Staff name is required' });
  const password_hash = password ? bcrypt.hashSync(password, 10) : null;
  const info = db.prepare('INSERT INTO staff (user_id, name, email, phone, department, role, salary, bank, pension_rate, hmo_plan, onboarding, next_of_kin, can_login, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, email || null, phone || null, department || 'sales', role || 'Staff', Number(salary) || 0, bank || null, Number(pension_rate ?? 8), hmo_plan || null, onboarding || 'invited', next_of_kin || null, password ? 1 : 0, password_hash);
  return { staff: db.prepare('SELECT * FROM staff WHERE id = ?').get(info.lastInsertRowid) };
});

app.put('/staff/:id', { preHandler: [requireAuth, gate('hr')] }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM staff WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Staff not found' });
  const c = req.body || {};
  db.prepare('UPDATE staff SET name = ?, email = ?, phone = ?, department = ?, role = ?, salary = ?, bank = ?, pension_rate = ?, hmo_plan = ?, onboarding = ?, status = ?, next_of_kin = ? WHERE id = ? AND user_id = ?')
    .run(c.name ?? existing.name, c.email ?? existing.email, c.phone ?? existing.phone, c.department ?? existing.department, c.role ?? existing.role,
      Number(c.salary ?? existing.salary), c.bank ?? existing.bank, Number(c.pension_rate ?? existing.pension_rate), c.hmo_plan ?? existing.hmo_plan,
      c.onboarding ?? existing.onboarding, c.status ?? existing.status, c.next_of_kin ?? existing.next_of_kin, req.params.id, req.user.id);
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
  let totalGross = 0, totalPension = 0, totalPaye = 0, totalNet = 0;
  const info = db.prepare('INSERT INTO payroll_runs (user_id, period) VALUES (?, ?)').run(req.user.id, period);
  const runId = info.lastInsertRowid;
  for (const s of staff) {
    const gross = s.salary;
    const pension = Math.round(gross * 0.08);
    const paye = payeMonthly(gross);
    const net = gross - pension - paye;
    db.prepare('INSERT INTO payslips (user_id, run_id, staff_id, gross, pension, paye, net) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, runId, s.id, gross, pension, paye, net);
    totalGross += gross; totalPension += pension; totalPaye += paye; totalNet += net;
  }
  db.prepare('UPDATE payroll_runs SET total_gross = ?, total_pension = ?, total_paye = ?, total_net = ? WHERE id = ?')
    .run(totalGross, totalPension, totalPaye, totalNet, runId);
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
  doc.pipe(reply.raw);
  doc.fontSize(20).font('Helvetica-Bold').text('PAYSLIP', { characterSpacing: 2 });
  doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('#444').text(`Period: ${slip.period}`, { align: 'right' });
  doc.moveDown(0.6);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text(slip.name);
  doc.fontSize(10).font('Helvetica').fillColor('#555').text(`${slip.role} · ${slip.department} · ${slip.bank || ''}`);
  doc.moveDown(1);
  const rows = [
    ['Gross salary', slip.gross, false],
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

// ---- health ----
app.get('/health', async () => ({ ok: true, service: 'omnicrm-api', time: new Date().toISOString() }));

const PORT = process.env.PORT || 4200;
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`OmniCRM API running on http://localhost:${PORT}`);
});
