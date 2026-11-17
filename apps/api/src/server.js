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
    return reply.code(401).send({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
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
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  const info = db.prepare('INSERT INTO messages (user_id, contact_id, direction, body, status) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, 'out', body, 'sent');
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

// ---- health ----
app.get('/health', async () => ({ ok: true, service: 'omnicrm-api', time: new Date().toISOString() }));

const PORT = process.env.PORT || 4200;
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`OmniCRM API running on http://localhost:${PORT}`);
});
