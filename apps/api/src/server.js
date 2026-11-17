// OmniCRM API — auth, contacts, deals, dashboard, AI follow-up engine (v0.1)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

// ---- health ----
app.get('/health', async () => ({ ok: true, service: 'omnicrm-api', time: new Date().toISOString() }));

const PORT = process.env.PORT || 4200;
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`OmniCRM API running on http://localhost:${PORT}`);
});
