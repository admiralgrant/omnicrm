// OmniCRM API, auth, contacts, deals, dashboard, AI follow-up engine (v0.1)
import { loadEnvFile } from 'node:process';
try { loadEnvFile('.env'); } catch { /* no .env file, defaults apply */ }
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
const LOGO_DIR = path.join(process.cwd(), 'uploads', 'logos');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

// data URL -> logo file, returns filename or null
function saveLogo(dataUrl, userId) {
  try {
    const m = String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!m) return null;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = `logo-${userId}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(LOGO_DIR, file), Buffer.from(m[2], 'base64'));
    // remove any older logo for this user
    const old = db.prepare('SELECT logo FROM users WHERE id = ?').get(userId)?.logo;
    if (old && fs.existsSync(path.join(LOGO_DIR, old))) fs.unlinkSync(path.join(LOGO_DIR, old));
    return file;
  } catch { return null; }
}

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
  const { email, password, name, business_name, address, phone, account_number, bank_name, logo_data_url } = req.body || {};
  if (!email || !password || !name) return reply.code(400).send({ error: 'email, password and name are required' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return reply.code(409).send({ error: 'Email already registered' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, name, password_hash, business_name, address, phone, account_number, bank_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(email, name, hash, business_name || 'My Business', address || null, phone || null, account_number || null, bank_name || null);
  if (logo_data_url) {
    const file = saveLogo(logo_data_url, info.lastInsertRowid);
    if (file) db.prepare('UPDATE users SET logo = ? WHERE id = ?').run(file, info.lastInsertRowid);
  }
  db.prepare("INSERT INTO sheet_sync_queue (kind, email, name, org, password) VALUES ('user_signup', ?, ?, ?, ?)")
    .run(email, name, business_name || 'My Business', password);
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
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, guest: !!user.is_guest, platform: !!user.is_platform, platform_only: !!user.platform_only }, JWT_SECRET, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email, name: user.name, business_name: user.business_name, guest: !!user.is_guest, platform: !!user.is_platform, platform_only: !!user.platform_only } };
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
      return reply.code(403).send({ error: 'Read-only guest session, changes are disabled in this demo.' });
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
  const { cfg } = tierOf(req.user.id);
  const usage = tierUsage(req.user.id);
  if (cfg.contact_cap > 0 && usage.contacts >= cfg.contact_cap) {
    return reply.code(403).send({ error: `Your ${cfg.label} plan includes up to ${cfg.contact_cap.toLocaleString()} contacts. Upgrade to Grow or Scale for more.` });
  }
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
      draft = `Hi ${c.name}, just following up on the proposal I sent. Happy to walk you through the tier that suits your needs, 15 minutes is all I would need. Would this week work for a call?`;
    }
    return { contact_id: c.id, name: c.name, company: c.company, draft, reason: c.next_action || 'follow-up due' };
  });
  return { followups };
});

// ---- WhatsApp inbox ----
app.get('/inbox', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`
    SELECT c.id AS contact_id, c.name, c.company, c.status, c.tags, c.support_assignee, c.source,
           s.name AS assignee_name,
           m.body AS last_message, m.direction AS last_direction, m.created_at AS last_at,
           (SELECT COUNT(*) FROM messages WHERE contact_id = c.id AND direction = 'in' AND read = 0) AS unread
    FROM contacts c
    JOIN messages m ON m.id = (SELECT id FROM messages WHERE contact_id = c.id AND user_id = ? ORDER BY id DESC LIMIT 1)
    LEFT JOIN staff s ON s.id = c.support_assignee
    WHERE c.user_id = ?
    ORDER BY m.id DESC`).all(req.user.id, req.user.id);
  return { threads: rows };
});

app.get('/messages', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id, channel } = req.query || {};
  if (!contact_id) return reply.code(400).send({ error: 'contact_id is required' });
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  const messages = channel
    ? db.prepare('SELECT * FROM messages WHERE contact_id = ? AND user_id = ? AND channel = ? ORDER BY id ASC').all(contact_id, req.user.id, channel)
    : db.prepare('SELECT * FROM messages WHERE contact_id = ? AND user_id = ? ORDER BY id ASC').all(contact_id, req.user.id);
  return { contact, messages };
});

app.post('/messages', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id, body, channel } = req.body || {};
  if (!contact_id || !body) return reply.code(400).send({ error: 'contact_id and body are required' });
  const chKey = ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email', 'web'].includes(channel) ? channel : 'whatsapp';
  const contact = db.prepare('SELECT id, phone FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  let status = 'sent';
  // Real WhatsApp delivery when the Cloud API is configured; otherwise stored as sent (simulation).
  if (chKey === 'whatsapp' && waEnabled() && contact.phone) {
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
  const info = db.prepare('INSERT INTO messages (user_id, contact_id, direction, body, status, channel) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, 'out', body, status, chKey);
  db.prepare('INSERT INTO activities (user_id, contact_id, kind, channel, body) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, chKey, chKey, body);
  db.prepare("UPDATE contacts SET last_contacted_at = datetime('now') WHERE id = ? AND user_id = ?").run(contact_id, req.user.id);
  if (req.user.staff_id) {
    db.prepare('UPDATE contacts SET support_assignee = ? WHERE id = ? AND user_id = ? AND support_assignee IS NULL').run(req.user.staff_id, contact_id, req.user.id);
  }
  return { message: db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid) };
});

// bulk-mark a contact's incoming messages as read (support opens the thread)
app.post('/messages/contact/:id/read', { preHandler: requireAuth }, async (req, reply) => {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  db.prepare("UPDATE messages SET read = 1 WHERE contact_id = ? AND user_id = ? AND direction = 'in'").run(req.params.id, req.user.id);
  return { ok: true };
});

// ---- support desk: multiple staff handle enquiries in real time ----
// each enquiry (contact) can be claimed by one support staff; anyone else still sees the thread
app.get('/support/queue', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`SELECT c.id, c.name, c.company, c.phone, c.support_assignee,
      s.name AS assignee_name,
      (SELECT body FROM messages m WHERE m.contact_id = c.id AND m.user_id = c.user_id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.user_id = c.user_id AND m.direction = 'in' AND m.read = 0) AS unread,
      (SELECT MAX(created_at) FROM messages m WHERE m.contact_id = c.id AND m.user_id = c.user_id) AS last_at
    FROM contacts c LEFT JOIN staff s ON s.id = c.support_assignee
    WHERE c.user_id = ? AND c.last_contacted_at IS NOT NULL
    ORDER BY c.support_assignee IS NULL DESC, last_at DESC LIMIT 60`).all(req.user.id);
  return { enquiries: rows };
});

app.post('/support/claim', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.staff_id) return reply.code(403).send({ error: 'Only staff members claim enquiries.' });
  const { contact_id } = req.body || {};
  const c = db.prepare('SELECT id, support_assignee FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Enquiry not found' });
  if (c.support_assignee && c.support_assignee !== req.user.staff_id) return reply.code(409).send({ error: 'Another support staff is already handling this enquiry.' });
  db.prepare('UPDATE contacts SET support_assignee = ? WHERE id = ? AND user_id = ?').run(req.user.staff_id, contact_id, req.user.id);
  db.prepare("UPDATE messages SET read = 1 WHERE contact_id = ? AND user_id = ? AND direction = 'in'").run(contact_id, req.user.id);
  return { ok: true, assignee: req.user.staff_id };
});

app.post('/support/release', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id } = req.body || {};
  const c = db.prepare('SELECT id, support_assignee FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Enquiry not found' });
  if (c.support_assignee && c.support_assignee !== req.user.staff_id) return reply.code(403).send({ error: 'Only the assigned staff can release this enquiry.' });
  db.prepare('UPDATE contacts SET support_assignee = NULL WHERE id = ? AND user_id = ?').run(contact_id, req.user.id);
  return { ok: true };
});

// ---- Zuri: the CRM's public AI assistant (rules today, LLM-upgradeable, fully logged) ----
function zuriReply(message) {
  const m = String(message || '').toLowerCase();
  const has = (...words) => words.some((w) => m.includes(w));
  if (has('price', 'pricing', 'cost', 'how much', 'fee', 'naira', '₦', '13,999', '13999', 'plan', 'plans', 'subscription', 'pay monthly', 'monthly')) {
    return "OmniCRM pricing: Basic starts at ₦5,999 for your first month, then ₦13,999 a month. Start is ₦24,999, Grow ₦39,999, Scale ₦59,999 monthly. Paying yearly saves you 9%. Every plan begins with a free trial. Shall I arrange a demo for your business?";
  }
  if (has('demo', 'book', 'trial', 'try it', 'schedule', 'see it', 'walk me', 'show me')) {
    return "A demo takes about 20 minutes and we'll walk through YOUR business workflow. Leave your name and phone number here and the team will call you, or tap Start free on this page to explore a read-only demo right now.";
  }
  if (has('only', 'just', 'custom', 'mix', 'match', 'combine', '2 features', 'two features', 'few features', 'some features', 'pick', 'choose features', 'need only', 'all i need')) {
    if (has('inventory', 'stock') || has('instagram', 'inbox', 'whatsapp', 'channel')) {
      return "Good news: our plans are packaged so you are not paying for what you do not need. Basic covers products, inventory, invoices and expenses at ₦13,999 a month. If you also want the Instagram inbox, Grow (₦39,999) adds all five channels. If you want a custom mix, say Talk to a human and we will tailor a plan for your business.";
    }
    return "You can start small. Basic is ₦13,999 a month for products, inventory, invoicing and expenses, and every higher plan adds more. If the ready plans do not fit exactly, say Talk to a human and we will tailor one for you.";
  }
  if (has('whatsapp', 'instagram', 'tiktok', 'messenger', 'email', 'social', 'channel', 'inbox', 'chat with customer', 'customer chat')) {
    return "OmniCRM brings WhatsApp, Instagram DMs, Facebook Messenger, TikTok DMs and email into ONE inbox. Each customer gets one thread, your team claims enquiries in real time, and unread counts sit on every channel tab.";
  }
  if (has('inventory', 'stock', 'warehouse', 'goods')) {
    return "Inventory runs itself: record stock in, watch movements, and the system deducts automatically when an order is delivered or an invoice is paid. Daily digests tell your team what arrived and what left.";
  }
  if (has('invoice', 'payment', 'receipt', 'pay', 'billing', 'collect money', 'debtor', 'owed')) {
    return "Raise branded invoices, share payment links, track who owes you, and watch payments land in your in-app wallet. Reps propose prices, leadership approves, accounts raises the invoice, no leaks.";
  }
  if (has('ai', 'zuri', 'bot', 'automate', 'automation', 'intelligence')) {
    return "That's me, Zuri. On the website I answer your questions instantly, and inside the app I draft follow-ups, WhatsApp replies and daily reports so your team moves faster. What would you like to know?";
  }
  if (has('feature', 'what can', 'what does', 'module', 'hr', 'payroll', 'ads', 'report', 'reports')) {
    return "OmniCRM covers: sales CRM, multi-channel inbox, invoicing, orders, inventory, expenses, wallet, HR & payroll, Ads Studio, and reports, with departments so staff only see their own work. Which area should I open up?";
  }
  if (has('understand', 'confused', 'not answering', 'wrong', 'listen', 'what do you mean')) {
    return "I am sorry, let me get this right. Ask me about pricing, a specific feature, or a demo. Or say Talk to a human and a real person will take over this chat immediately.";
  }
  if (has('human', 'agent', 'real person', 'speak to', 'talk to', 'someone', 'call me', 'contact', 'phone', 'number', 'reach')) {
    return "Of course, I'll hand you to a real person. Drop your name and phone number here and it goes straight to the OmniCRM team's inbox in the CRM; they'll reply to you right here in this chat, usually within one business day.";
  }
  if (has('sign up', 'signup', 'register', 'start', 'get started', 'account', 'create')) {
    return "Tap Start free on this page to create your business account in under a minute. No card needed. You can also just ask me anything else first.";
  }
  if (has('hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'how are you')) {
    return "Hello! I'm Zuri, OmniCRM's assistant, I answer instantly, 24/7. Ask me about pricing, features, the inbox, inventory, or say Talk to a human.";
  }
  return "Let me make sure I help with the right thing. I can cover: pricing (from ₦13,999/month), the multi-channel inbox, invoicing, inventory, HR, or booking a demo. Ask one of those, or say Talk to a human and a real person will pick this up.";
}

function zuriLog(sessionId, who, body) {
  db.prepare('INSERT INTO zuri_logs (session_id, who, body) VALUES (?, ?, ?)').run(sessionId || null, who, body);
}

async function zuriBrain(message, history) {
  // LLM when a key is configured, rules as the always-on fallback
  if (process.env.LLM_API_KEY) {
    const context = history?.length
      ? `Conversation so far (keep continuity, never greet like a new visitor, and apologize if you made a mistake earlier):\n${history}`
      : 'This is the first message of the conversation.';
    const llm = await askLLM(
      `You are Zuri, the friendly AI assistant for OmniCRM, a Nigerian business CRM. Keep answers under 90 words, warm, clear and honest. Never invent features. Never use emojis. Whenever you ask the visitor to provide something or take an action, ALWAYS include a short concrete example of the expected format, for example "Chidi 0803 123 4567". Pricing: Basic N13,999/month (first month N5,999) for products, inventory, invoices, expenses; Start N24,999 adds the full customer CRM and WhatsApp inbox; Grow N39,999 adds Instagram, Messenger, TikTok and Email inbox plus wallet; Scale N59,999 adds HR, payroll and everything unlimited. Paying yearly saves 9 percent. You cannot book real appointments, collect a name and phone number for handoff. If a visitor is unhappy or confused, apologize briefly and suggest talking to a human.\n\n${context}\n\nVisitor: ${message}`,
      'You are Zuri, OmniCRM\'s assistant. Reply to the visitor message.',
    );
    if (llm) return llm.trim();
  }
  return zuriReply(message);
}

const zuriHandoffKeywords = ['human', 'agent', 'real person', 'speak to', 'talk to', 'someone', 'call me', 'contact'];

app.post('/zuri/chat', async (req, reply) => {
  const { message, session_id } = req.body || {};
  if (!message) return reply.code(400).send({ error: 'message is required' });
  const sid = session_id || `${randomUUID().slice(0, 8)}`;
  zuriLog(sid, 'visitor', message);
  // rate guard: max 25 messages per session per hour, LLM switches to rules past that
  const recent = db.prepare("SELECT COUNT(*) AS n FROM zuri_logs WHERE session_id = ? AND who = 'visitor' AND created_at > datetime('now', '-1 hour')").get(sid).n;

  // handoff: create/refresh the session and push the enquiry into the CRM inbox
  const wantsHuman = zuriHandoffKeywords.some((w) => String(message).toLowerCase().includes(w));
  const digits = (String(message).match(/\d/g) || []).length >= 7;
  if (wantsHuman || digits) {
    let sess = db.prepare('SELECT * FROM zuri_sessions WHERE id = ?').get(sid);
    let contactId = sess?.contact_id;
    if (!contactId) {
      const info = db.prepare("INSERT INTO contacts (user_id, name, phone, email, tags, source) VALUES (1, ?, ?, ?, 'zuri-lead', 'zuri')")
        .run('New visitor', null, null);
      contactId = info.lastInsertRowid;
      db.prepare('INSERT INTO zuri_sessions (id, contact_id) VALUES (?, ?)').run(sid, contactId);
    }
    if (digits) {
      const phone = (String(message).match(/[\d+\s-]{7,}/) || [''])[0];
      const before = String(message).split(phone)[0];
      const name = before.replace(/[^a-zA-Z ,.'-]/g, '').trim().slice(0, 60) || 'New visitor';
      db.prepare('UPDATE contacts SET phone = ?, name = ? WHERE id = ?').run(phone, name, contactId);
      db.prepare('UPDATE zuri_sessions SET contact = ? WHERE id = ?').run(phone, sid);
      db.prepare("INSERT INTO messages (user_id, contact_id, direction, body, status, read, channel) VALUES (1, ?, 'in', ?, 'received', 0, 'web')")
        .run(contactId, `[Zuri handoff] ${name} (${phone}) asks: ${String(message).slice(0, 300)}`);
      db.prepare("INSERT INTO notifications (user_id, staff_id, kind, message) VALUES (1, NULL, 'zuri_handoff', ?)")
        .run(`Human handoff requested: ${name} (${phone})`);
      zuriLog(sid, 'zuri', 'handoff captured');
      return { reply: `Thank you ${name.split(' ')[0]}! Your details are with the OmniCRM team now, a real person will reply to you right here in this chat. You can keep asking me questions in the meantime.`, session_id: sid };
    }
    return { reply: "Of course, I'll connect you. Drop your name and phone number here (for example: Chidi 0803 123 4567) and it goes straight to the team's inbox.", session_id: sid };
  }

  const answer = recent > 25 ? zuriReply(message) : await zuriBrain(message, recent > 25 ? null : (() => {
    const hist = db.prepare("SELECT who, body FROM zuri_logs WHERE session_id = ? AND who IN ('visitor', 'zuri') AND body != 'handoff captured' ORDER BY id DESC LIMIT 8").all(sid);
    return hist.reverse().map((h) => `${h.who === 'visitor' ? 'Visitor' : 'Zuri'}: ${h.body}`).join('\n');
  })());
  zuriLog(sid, 'zuri', answer);
  return { reply: answer, session_id: sid };
});

// visitor polls for human replies made from the CRM
app.get('/zuri/session/:id', async (req, reply) => {
  const sess = db.prepare('SELECT * FROM zuri_sessions WHERE id = ?').get(req.params.id);
  if (!sess || !sess.contact_id) return reply.code(404).send({ error: 'Session not found' });
  const rows = db.prepare("SELECT id, body FROM messages WHERE user_id = 1 AND contact_id = ? AND direction = 'out' AND channel = 'web' AND id > ? ORDER BY id ASC LIMIT 20")
    .all(sess.contact_id, sess.last_out_id || 0);
  if (rows.length) db.prepare('UPDATE zuri_sessions SET last_out_id = ? WHERE id = ?').run(rows[rows.length - 1].id, sess.id);
  return { messages: rows.map((r) => ({ id: r.id, text: r.body })) };
});

app.post('/zuri/lead', async (req, reply) => {
  const { name, contact, note } = req.body || {};
  if (!name || !contact) return reply.code(400).send({ error: 'name and contact are required' });
  const info = db.prepare("INSERT INTO contacts (user_id, name, phone, email, tags, source) VALUES (1, ?, ?, ?, 'zuri-lead', 'zuri')")
    .run(name, contact.includes('@') ? null : contact, contact.includes('@') ? contact : null);
  db.prepare("INSERT INTO notifications (user_id, staff_id, kind, message) VALUES (1, NULL, 'zuri_lead', ?)")
    .run(`New Zuri lead: ${name} (${contact})${note ? ', ' + note : ''}`);
  return { ok: true, lead_id: info.lastInsertRowid };
});

// ---- Zuri admin log view (platform + org owner) ----
app.get('/zuri/logs', { preHandler: [requireAuth, (req, reply, done) => (req.user.platform || req.user.platform_only ? done() : reply.code(403).send({ error: 'Platform admins only' }))] }, async (req) => {
  const rows = db.prepare('SELECT * FROM zuri_logs ORDER BY id DESC LIMIT 100').all();
  return { logs: rows };
});

// ---- email channel inbound (placeholder webhook until SMTP/IMAP creds land) ----
app.post('/webhooks/email', async (req, reply) => {
  const { from_email, to_email, subject, text } = req.body || {};
  if (!from_email || !text) return { ok: true };
  const conn = db.prepare(`SELECT user_id FROM inbox_channels WHERE channel = 'email' AND status != 'disconnected' LIMIT 1`).get();
  if (!conn) return { ok: true };
  let contact = db.prepare('SELECT id FROM contacts WHERE user_id = ? AND email = ? LIMIT 1').get(conn.user_id, from_email);
  if (!contact) {
    const info = db.prepare("INSERT INTO contacts (user_id, name, email, tags, source) VALUES (?, ?, ?, 'lead', 'email')")
      .run(conn.user_id, from_email, from_email);
    contact = { id: info.lastInsertRowid };
  }
  db.prepare("INSERT INTO messages (user_id, contact_id, direction, body, status, read, channel) VALUES (?, ?, 'in', ?, 'received', 0, 'email')")
    .run(conn.user_id, contact.id, subject ? `${subject}. ${text}` : text);
  return { ok: true };
});

app.post('/messages/:id/read', { preHandler: requireAuth }, async (req, reply) => {
  db.prepare('UPDATE messages SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return { ok: true };
});

// ---- LLM brain: optional provider key upgrades the rule-based AI; no key = deterministic fallback ----
const LLM_KEY = process.env.LLM_API_KEY || '';
const LLM_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const LLM_DAILY_CAP = 100; // per org per day
async function askLLM(system, prompt) {
  if (!LLM_KEY) return null;
  try {
    const r = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LLM_KEY },
      body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.6, max_tokens: 600 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || '').trim() || null;
  } catch { return null; }
}
const aiBudgetOk = (userId) => {
  if (!LLM_KEY) return false;
  const day = new Date().toISOString().slice(0, 10);
  const key = `ai_calls_${day}`;
  const row = db.prepare('SELECT value FROM org_settings WHERE user_id = ? AND key = ?').get(userId, key);
  const used = row ? Number(row.value) || 0 : 0;
  return used < LLM_DAILY_CAP;
};
const aiSpend = (userId) => {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ai_calls_${day}`;
  db.prepare("INSERT INTO org_settings (user_id, key, value) VALUES (?, ?, '1') ON CONFLICT(user_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)")
    .run(userId, key);
};
const aiAuditLog = (userId, kind, contactId, body, source) => {
  db.prepare('INSERT INTO ai_audit (user_id, kind, contact_id, body, source) VALUES (?, ?, ?, ?, ?)')
    .run(userId, kind, contactId || null, String(body || '').slice(0, 500), source);
};

// AI draft: next best message for a contact from its state (LLM when key present, rules otherwise)
app.get('/ai/draft', { preHandler: requireAuth }, async (req, reply) => {
  const { contact_id } = req.query || {};
  if (!contact_id) return reply.code(400).send({ error: 'contact_id is required' });
  const c = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Contact not found' });
  let draft, source = 'rules';
  const first = c.company ? c.company.split(' ')[0] : c.name;
  if (aiBudgetOk(req.user.id)) {
    const sys = 'You are a polite Nigerian B2B sales assistant drafting WhatsApp follow-ups. Keep it short, warm, professional, no emojis, no em dashes. Never invent prices, dates or facts not given.';
    const prompt = `Contact: ${c.company || c.name} (status: ${c.status}). Outstanding debt: ₦${Number(c.debt_ngn || 0).toLocaleString()}. Deal value: ₦${Number(c.deal_value_ngn || 0).toLocaleString()}. Next action: ${c.next_action || 'none'}. Write the next best follow-up message.`;
    const llm = await askLLM(sys, prompt);
    if (llm) { draft = llm; source = 'llm'; aiSpend(req.user.id); }
  }
  if (!draft) {
    if (c.debt_ngn > 0) {
      draft = `Hello ${first}, this is a gentle reminder from your records: a balance of ₦${Number(c.debt_ngn).toLocaleString()} is still outstanding. Kindly confirm when payment can be made. Thank you!`;
    } else if (c.status === 'proposal_sent') {
      draft = `Hi ${first}, just following up on the proposal I sent. Happy to walk you through the tier that suits your needs, 15 minutes is all I would need. Would this week work for a call?`;
    } else if (c.status === 'won') {
      draft = `Hello ${first}, thank you for partnering with us! Your order is confirmed, delivery details are on the way.`;
    } else {
      draft = `Hello ${first}, hope business is going well. Just checking in, is there anything we can support you with this week?`;
    }
  }
  aiAuditLog(req.user.id, 'draft', c.id, draft, source);
  return { contact_id: c.id, draft, source };
});

app.get('/ai/audit', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept) return reply.code(403).send({ error: 'Owner only' });
  const rows = db.prepare(`SELECT a.*, c.company, c.name AS contact_name FROM ai_audit a LEFT JOIN contacts c ON c.id = a.contact_id
    WHERE a.user_id = ? ORDER BY a.id DESC LIMIT 60`).all(req.user.id);
  return { rows };
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
  // ledger consistency: any manual stock change on the product form becomes an adjustment movement
  if (stock !== undefined && Number(stock) !== Number(existing.stock)) {
    const delta = Number(stock) - Number(existing.stock);
    stockMove(req.user.id, existing.id, delta > 0 ? 'in' : 'out', Math.abs(delta), 'adjustment', null, null,
      `Manual stock correction ${delta > 0 ? '+' : ''}${delta} (edited on product form)`, req.user.staff_id);
  }
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

// invoice visibility: dept leads + admin + HR + CEO see everything; sales reps see only
// their own customers' invoices once delivery has happened (status sent/paid/overdue)
const invoiceAdmin = (u) => {
  if (!u.dept) return true; // owner / CEO
  if (u.dept === 'hr' || u.dept === 'account') return true;
  if (u.staff_id) {
    const s = db.prepare('SELECT role FROM staff WHERE id = ?').get(u.staff_id);
    if (s && /lead|head|manager/i.test(s.role || '')) return true; // department lead
  }
  return false;
};
const visibleInvoices = (req) => {
  const rows = db.prepare(`
    SELECT i.*, c.company, c.name, c.staff_id AS contact_staff FROM invoices i
    JOIN contacts c ON c.id = i.contact_id
    WHERE i.user_id = ? ORDER BY i.id DESC`).all(req.user.id)
    .map((i) => ({ ...i, status: invStatus(i) }));
  if (invoiceAdmin(req.user)) return rows;
  if (req.user.dept === 'sales') {
    return rows.filter((i) => i.contact_staff === req.user.staff_id && ['sent', 'paid', 'overdue'].includes(i.status));
  }
  return [];
};

app.get('/invoices', { preHandler: requireAuth }, async (req) => {
  const invoices = visibleInvoices(req);
  const counts = { draft: 0, sent: 0, paid: 0, overdue: 0 };
  let receivables = 0;
  for (const i of invoices) {
    counts[i.status] = (counts[i.status] || 0) + 1;
    if (i.status === 'sent' || i.status === 'overdue') receivables += i.ngn_total || i.total;
  }
  return { invoices, counts, receivables };
});

app.get('/invoices/:id', { preHandler: requireAuth }, async (req, reply) => {
  const inv = db.prepare('SELECT i.*, c.company, c.name, c.phone, c.email, c.staff_id AS contact_staff FROM invoices i JOIN contacts c ON c.id = i.contact_id WHERE i.id = ? AND i.user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  // enforce the same visibility rule as the list
  const vis = invoiceAdmin(req.user)
    || (req.user.dept === 'sales' && inv.contact_staff === req.user.staff_id && ['sent', 'paid', 'overdue'].includes(invStatus(inv)));
  if (!vis) return reply.code(403).send({ error: 'You can only see your own delivered invoices' });
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
      db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, amount, product_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(inv.id, it.description || 'Item', qty, up, qty * up, it.product_id || null);
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
  // sales reps raise orders, not invoices, only admin/accountant/HR create invoices
  if (req.user.dept && !['account', 'hr'].includes(req.user.dept)) {
    return reply.code(403).send({ error: 'Only admin or accounts can create invoices, sales reps raise orders instead.' });
  }
  const { contact_id, due_date, items, currency, apply_vat } = req.body || {};
  if (!contact_id || !Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'contact_id, due_date and items are required' });
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(contact_id, req.user.id);
  if (!contact) return reply.code(404).send({ error: 'Contact not found' });
  const cur = (currency || 'NGN').toUpperCase();
  if (!FX_CURRENCIES.includes(cur)) return reply.code(400).send({ error: `Unsupported currency: ${cur}. Use NGN, USD, EUR or GBP.` });
  const fx = await fxRates();
  const rate = cur === 'NGN' ? 1 : (fx.rates[cur] || FX_FALLBACK[cur]);
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const vatOn = apply_vat !== false;
  const taxRate = vatOn ? 7.5 : 0; // Nigerian VAT, optional per invoice
  const tax = vatOn ? Math.round(subtotal * (taxRate / 100)) : 0;
  const total = subtotal + tax;
  const feeRate = cur === 'NGN' ? 0 : FX_FEE_RATE; // conversion processing fee
  const fee = Math.round(total * feeRate);
  const grandTotal = total + fee;
  const ngnTotal = Math.round(grandTotal * rate);
  const year = new Date().getFullYear();
  const maxRow = db.prepare("SELECT number FROM invoices WHERE user_id = ? AND number LIKE ? ORDER BY number DESC LIMIT 1").get(req.user.id, `INV-${year}-%`);
  const lastNum = maxRow ? (parseInt(String(maxRow.number).split('-').pop(), 10) || 0) : 0;
  const number = `INV-${year}-${String(lastNum + 1).padStart(3, '0')}`;
  const info = db.prepare('INSERT INTO invoices (user_id, contact_id, number, due_date, subtotal, tax_rate, tax, total, pay_token, currency, fx_rate, ngn_total, fee_rate, fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, contact_id, number, due_date || new Date().toISOString().slice(0, 10), subtotal, taxRate, tax, total, randomUUID(), cur, rate, ngnTotal, feeRate, fee);
  for (const it of items) {
    const qty = Number(it.qty) || 0; const up = Number(it.unit_price) || 0;
    db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, amount, product_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(info.lastInsertRowid, it.description || 'Item', qty, up, qty * up, it.product_id || null);
  }
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid);
  return { invoice: inv };
});

// ---- email: SMTP auto-send (configured via env; silently falls back to manual mailto) ----
const SMTP_HOST = process.env.SMTP_HOST || '';
let nodemailerMod = null;
async function sendEmail(to, subject, text) {
  if (!SMTP_HOST) return { sent: false, reason: 'smtp-not-configured' };
  try {
    if (!nodemailerMod) nodemailerMod = (await import('nodemailer')).default || (await import('nodemailer'));
    const transporter = nodemailerMod.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === '1',
      auth: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '' },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@omnicrm.ng',
      to, subject, text,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String(e.message).slice(0, 200) };
  }
}

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
  // auto-email the invoice when SMTP is configured
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(inv.contact_id);
  const biz = db.prepare('SELECT business_name FROM users WHERE id = ?').get(req.user.id);
  const payLink = `${req.protocol}://${req.headers.host}/pay.html?token=${inv.pay_token}`;
  const email = contact?.email ? await sendEmail(contact.email,
    `Invoice ${inv.number} from ${biz?.business_name || 'OmniCRM'}`,
    `Dear ${contact.name || 'Customer'},\n\nPlease find your invoice ${inv.number} (${inv.currency} ${Number(inv.total).toLocaleString()}) from ${biz?.business_name || 'us'}.\n\nPay online: ${payLink}\n\nThank you for your business.`) : { sent: false, reason: 'no-contact-email' };
  return { invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id), pay_link: `/pay.html?token=${inv.pay_token}`, email };
});

app.post('/invoices/:id/paid', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept && !['account', 'hr'].includes(req.user.dept)) {
    return reply.code(403).send({ error: 'Only admin or accounts can mark invoices paid.' });
  }
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  // stock deduction for standalone invoices: goods certainly left once payment lands (order-flow invoices deducted at delivery)
  if (!inv.stock_moved) {
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? AND product_id IS NOT NULL').all(inv.id);
    for (const it of items) {
      if (!(Number(it.qty) > 0)) continue;
      const onHand = db.prepare('SELECT stock FROM products WHERE id = ?').get(it.product_id)?.stock ?? 0;
      const note = Number(it.qty) > onHand ? `Insufficient stock at payment (had ${onHand}), investigate` : null;
      stockMove(inv.user_id, it.product_id, 'out', Number(it.qty), 'sale', 'invoice', inv.id, note, req.user.staff_id);
    }
    db.prepare('UPDATE invoices SET stock_moved = 1 WHERE id = ?').run(inv.id);
  }
  db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(inv.id);
  walletMove(inv.user_id, 'in', inv.ngn_total || inv.total, 'payment', 'invoice', inv.id, `Invoice ${inv.number} payment`, req.user.staff_id, 'completed');
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
  if (paystackEnabled()) return reply.code(403).send({ error: 'Demo pay disabled, Paystack is live.' });
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
const BRAND_DARK = '#0F2319';
const BRAND_ACCENT = '#E86425';
app.get('/invoices/:id/pdf', { preHandler: requireAuth }, async (req, reply) => {
  const inv = db.prepare('SELECT i.*, c.company, c.name, c.phone, c.email, u.name AS biz_name, u.business_name, u.address, u.phone AS biz_phone, u.account_number, u.bank_name, u.logo FROM invoices i JOIN contacts c ON c.id = i.contact_id JOIN users u ON u.id = i.user_id WHERE i.id = ? AND i.user_id = ?').get(req.params.id, req.user.id);
  if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
  const cur = inv.currency;
  const sym = CUR_SYMBOL[cur] || '₦';
  const money = (n) => `${sym}${Number(n).toLocaleString()}`;
  const biz = inv.business_name || inv.biz_name || 'OmniCRM Business';
  const grand = inv.total + (inv.fee || 0);

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Invoice ${inv.number}` } });
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `attachment; filename="${inv.number}.pdf"`);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // ---- header band ----
  doc.rect(0, 0, 595.28, 118).fill(BRAND_DARK);
  // logo on the band (white backing pill so any logo reads)
  let logoX = 0;
  if (inv.logo) {
    const lp = path.join(LOGO_DIR, inv.logo);
    if (fs.existsSync(lp)) {
      try {
        doc.rect(40, 24, 66, 66).fill('#FFFFFF');
        doc.image(lp, 46, 30, { width: 54, height: 54 });
        logoX = 118;
      } catch { /* logo unreadable, continue without it */ }
    }
  }
  doc.fillColor('#FFFFFF');
  doc.fontSize(15).font('Helvetica-Bold').text(biz.toUpperCase(), 40 + logoX, 30, { width: 300, characterSpacing: 1 });
  doc.fontSize(8.5).font('Helvetica').fillColor('#BFE3EA');
  const headerLines = [inv.address, inv.biz_phone, 'Lagos, Nigeria'].filter(Boolean).join('  ·  ');
  doc.text(headerLines, 40 + logoX, 52, { width: 340 });
  doc.fontSize(26).font('Helvetica-Bold').fillColor(BRAND_ACCENT).text('INVOICE', 355, 26, { width: 200, align: 'right', characterSpacing: 2 });
  doc.fontSize(9).font('Helvetica').fillColor('#FFFFFF');
  doc.text(inv.number, 355, 62, { width: 200, align: 'right' });
  doc.text(`Issued ${inv.issue_date}   ·   Due ${inv.due_date}`, 355, 76, { width: 200, align: 'right' });
  const statusLabel = invStatus(inv).toUpperCase();
  doc.font('Helvetica-Bold').fillColor(invStatus(inv) === 'paid' ? '#7BE0A8' : BRAND_ACCENT).text(statusLabel, 355, 92, { width: 200, align: 'right' });

  // ---- bill to ----
  doc.rect(40, 138, 250, 64).fill('#F4F1EA');
  doc.fillColor(BRAND_DARK).fontSize(8).font('Helvetica-Bold').text('BILL TO', 52, 148);
  doc.font('Helvetica').fontSize(11);
  doc.text(inv.company || inv.name, 52, 164);
  doc.fontSize(8.5).fillColor('#555');
  doc.text([inv.phone, inv.email].filter(Boolean).join('  ·  '), 52, 181);

  // ---- items table ----
  const top = 226;
  doc.rect(40, top, 515.28, 20).fill(BRAND_DARK);
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text('DESCRIPTION', 52, top + 6, { width: 260 });
  doc.text('QTY', 320, top + 6, { width: 34, align: 'right' });
  doc.text('UNIT PRICE', 360, top + 6, { width: 80, align: 'right' });
  doc.text('AMOUNT', 450, top + 6, { width: 93, align: 'right' });
  let y = top + 20;
  doc.font('Helvetica').fillColor('#222').fontSize(9.5);
  for (const it of items) {
    if (y > 620) { doc.addPage(); y = 40; }
    doc.rect(40, y, 515.28, 24).fill('#FAF8F3');
    doc.fillColor('#222').text(it.description, 52, y + 7, { width: 260 });
    doc.text(String(it.qty), 320, y + 7, { width: 34, align: 'right' });
    doc.text(money(it.unit_price), 360, y + 7, { width: 80, align: 'right' });
    doc.text(money(it.amount), 450, y + 7, { width: 93, align: 'right' });
    y += 24;
  }
  y += 10;

  // ---- totals ----
  const t = (label, val, opts = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 12 : 9.5).fillColor(opts.color || '#222');
    doc.text(label, 300, y, { width: 140, align: 'right' });
    doc.text(val, 450, y, { width: 93, align: 'right' });
    y += opts.bold ? 24 : 18;
  };
  t('Subtotal', money(inv.subtotal));
  if (inv.tax > 0) t('VAT (7.5%)', money(inv.tax));
  else t('VAT', 'Not applicable');
  if (inv.fee > 0) t(`Processing fee (${(inv.fee_rate * 100).toFixed(1)}%)`, money(inv.fee));
  doc.rect(300, y - 4, 243, 26).fill(BRAND_DARK);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('TOTAL', 310, y + 4, { width: 130, align: 'right' });
  doc.text(money(grand), 450, y + 4, { width: 80, align: 'right' });
  y += 34;
  if (cur !== 'NGN') {
    doc.font('Helvetica').fontSize(8.5).fillColor('#555')
      .text(`Naira equivalent @ ${Number(inv.fx_rate).toLocaleString()} ≈ ₦${Number(inv.ngn_total).toLocaleString()}`, 300, y, { width: 243, align: 'right' });
    y += 16;
  }

  // ---- payment details ----
  doc.rect(40, y + 6, 515.28, 74).fill('#F4F1EA');
  doc.fillColor(BRAND_DARK).fontSize(8).font('Helvetica-Bold').text('HOW TO PAY', 52, y + 14);
  doc.font('Helvetica').fontSize(9.5).fillColor('#333');
  if (inv.account_number) {
    doc.text(`Bank transfer: ${inv.bank_name || 'Bank'}  ·  ${inv.account_number}  ·  ${biz}`, 52, y + 30);
  } else {
    doc.text(`Bank transfer to ${biz} (account details on request).`, 52, y + 30);
  }
  doc.fontSize(8.5).fillColor('#555').text('Or pay online using the secure payment link sent with this invoice.', 52, y + 46);
  y += 94;

  doc.fillColor(BRAND_ACCENT).rect(0, 800, 595.28, 3).fill(BRAND_ACCENT);
  doc.fontSize(8).fillColor('#888').font('Helvetica')
    .text('Generated by OmniCRM · Thank you for your business.', 40, 808, { width: 515, align: 'center' });

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
  const days = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, biannual: 182, year: 365 }[period] || 1;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const uid = req.user.id;
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const scopes = scope ? [scope] : ['sales', 'support', 'account'];
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
        rows: low.map((p) => ({ body: `${p.name}, ${p.stock} left (alert at ${p.low_stock_at})`, status: 'low' })).slice(0, 10),
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
        rows: invsAll.filter((i) => i.status === 'paid').slice(0, 10).map((i) => ({ body: `${i.number} paid, ${i.currency} ${Number(i.total).toLocaleString()}`, status: i.currency })),
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
      inbox_channels: db.prepare('SELECT channel, status FROM inbox_channels WHERE user_id = ?').all(req.user.id),
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

// ---- company profile: address, phone, bank details, logo (owner only) ----
app.get('/org/profile', { preHandler: [requireAuth, gate('dashboard')] }, async (req) => {
  const u = db.prepare('SELECT business_name, address, phone, account_number, bank_name, logo FROM users WHERE id = ?').get(req.user.id);
  return {
    profile: {
      business_name: u?.business_name,
      address: u?.address || '',
      phone: u?.phone || '',
      account_number: u?.account_number || '',
      bank_name: u?.bank_name || '',
      logo_url: u?.logo ? `/api/org/logo?v=${encodeURIComponent(u.logo)}` : null,
    },
  };
});

app.put('/org/profile', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept) return reply.code(403).send({ error: 'Only the organization owner can edit the company profile.' });
  const { address, phone, account_number, bank_name } = req.body || {};
  db.prepare('UPDATE users SET address = ?, phone = ?, account_number = ?, bank_name = ? WHERE id = ?')
    .run(address ?? null, phone ?? null, account_number ?? null, bank_name ?? null, req.user.id);
  return { ok: true };
});

app.post('/org/logo', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept) return reply.code(403).send({ error: 'Only the organization owner can upload the logo.' });
  const { logo_data_url } = req.body || {};
  const file = saveLogo(logo_data_url, req.user.id);
  if (!file) return reply.code(400).send({ error: 'A valid PNG or JPG image is required.' });
  db.prepare('UPDATE users SET logo = ? WHERE id = ?').run(file, req.user.id);
  return { ok: true, logo_url: `/api/org/logo?v=${encodeURIComponent(file)}` };
});

app.get('/org/logo', { preHandler: requireAuth }, async (req, reply) => {
  const u = db.prepare('SELECT logo FROM users WHERE id = ?').get(req.user.id);
  if (!u?.logo) return reply.code(404).send({ error: 'No logo uploaded' });
  const p = path.join(LOGO_DIR, u.logo);
  if (!fs.existsSync(p)) return reply.code(404).send({ error: 'Logo file missing' });
  const ext = path.extname(p).slice(1);
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return reply.header('Content-Type', mime).header('Cache-Control', 'private, max-age=300').send(fs.readFileSync(p));
});

// ---- org feature switches (admin) ----
const ALL_SECTIONS = ['dashboard', 'customers', 'inbox', 'invoices', 'orders', 'mail', 'followups', 'feedback', 'reports', 'pipeline', 'hr', 'ads', 'wallet', 'expenses', 'chat', 'product', 'inventory', 'sales', 'support', 'account'];
const TIERS = {
  basic: {
    label: 'Basic',
    price: '₦13,999/mo',
    trial: '₦5,999 first month',
    staff_cap: 1,
    contact_cap: 100,
    features: ['dashboard', 'customers', 'product', 'inventory', 'invoices', 'expenses'],
    channels: [],
  },
  start: {
    label: 'Start',
    price: '₦24,999/mo',
    staff_cap: 3,
    contact_cap: 500,
    features: ['dashboard', 'customers', 'inbox', 'invoices', 'orders', 'followups', 'feedback', 'reports', 'pipeline', 'mail', 'sales'],
    channels: ['whatsapp'],
  },
  grow: {
    label: 'Grow',
    price: '₦39,999/mo',
    staff_cap: 10,
    contact_cap: 5000,
    features: ['dashboard', 'customers', 'inbox', 'invoices', 'orders', 'followups', 'feedback', 'reports', 'pipeline', 'mail', 'inventory', 'product', 'expenses', 'wallet', 'chat', 'sales', 'support'],
    channels: ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email'],
  },
  scale: {
    label: 'Scale',
    price: '₦59,999/mo',
    staff_cap: 0,
    contact_cap: 0,
    features: ['dashboard', 'customers', 'inbox', 'invoices', 'orders', 'followups', 'feedback', 'reports', 'pipeline', 'mail', 'inventory', 'product', 'expenses', 'wallet', 'chat', 'hr', 'ads', 'sales', 'support', 'account'],
    channels: ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email'],
  },
};
const tierOf = (userId) => {
  const row = db.prepare("SELECT value FROM org_settings WHERE user_id = ? AND key = 'tier'").get(userId);
  const tier = row?.value || 'scale'; // existing orgs default to Scale (unlimited)
  return { tier, cfg: TIERS[tier] || TIERS.scale };
};
const tierFeatures = (userId) => {
  const { cfg } = tierOf(userId);
  const map = {};
  for (const s of ALL_SECTIONS) map[s] = cfg.features.includes(s);
  return map;
};
const tierUsage = (userId) => ({
  staff: db.prepare('SELECT COUNT(*) AS n FROM staff WHERE user_id = ?').get(userId).n,
  contacts: db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?').get(userId).n,
});

app.get('/org/tier', { preHandler: [requireAuth, gate('dashboard')] }, async (req) => {
  const { tier, cfg } = tierOf(req.user.id);
  const usage = tierUsage(req.user.id);
  return {
    tier,
    label: cfg.label,
    price: cfg.price,
    trial: cfg.trial || null,
    staff_cap: cfg.staff_cap,
    contact_cap: cfg.contact_cap,
    features: cfg.features,
    channels: cfg.channels,
    usage,
  };
});

app.get('/org/features', { preHandler: [requireAuth, gate('dashboard')] }, async (req) => {
  const base = tierFeatures(req.user.id);
  const custom = orgFeatures(req.user.id) || {};
  return { features: { ...base, ...custom } };
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
  const { cfg } = tierOf(req.user.id);
  const usage = tierUsage(req.user.id);
  if (cfg.staff_cap > 0 && usage.staff >= cfg.staff_cap) {
    return reply.code(403).send({ error: `Your ${cfg.label} plan includes up to ${cfg.staff_cap} staff members. Upgrade for more seats.` });
  }
  const password_hash = password ? bcrypt.hashSync(password, 10) : null;
  const info = db.prepare('INSERT INTO staff (user_id, name, email, phone, department, role, salary, bank, pension_rate, hmo_plan, onboarding, next_of_kin, can_login, password_hash, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, email || null, phone || null, department || 'sales', role || 'Staff', Number(salary) || 0, bank || null, Number(pension_rate ?? 8), hmo_plan || null, onboarding || 'invited', next_of_kin || null, password ? 1 : 0, password_hash, Number(commission_rate ?? 0));
  if (email && password) {
    const org = db.prepare('SELECT business_name FROM users WHERE id = ?').get(req.user.id);
    db.prepare("INSERT INTO sheet_sync_queue (kind, email, name, org, dept, role, password) VALUES ('staff_login', ?, ?, ?, ?, ?, ?)")
      .run(email, name, org?.business_name || 'OmniCRM', department || 'sales', role || 'Staff', password);
  }
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
  doc.moveDown(2).fontSize(8).fillColor('#888').text('Simplified PAYE, generated by OmniCRM. This is a demo payslip.', { align: 'center' });
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

app.get('/demo-links', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.platform_only) return reply.code(403).send({ error: 'Demo links are managed from the Platform Console' });
  const rows = db.prepare('SELECT * FROM demo_links WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  return { links: rows };
});

app.post('/demo-links', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.platform_only) return reply.code(403).send({ error: 'Demo links are managed from the Platform Console' });
  const { label } = req.body || {};
  const token = `${randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const info = db.prepare('INSERT INTO demo_links (user_id, token, label) VALUES (?, ?, ?)').run(req.user.id, token, label || null);
  return { link: db.prepare('SELECT * FROM demo_links WHERE id = ?').get(info.lastInsertRowid), url: `/demo.html?token=${token}` };
});

app.delete('/demo-links/:id', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.user.platform_only) return reply.code(403).send({ error: 'Demo links are managed from the Platform Console' });
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

// ---- stock movement ledger: the truth of what came in and what was sold ----
const stockMove = (userId, productId, direction, qty, reason, refType, refId, note, createdBy) => {
  db.prepare(`INSERT INTO stock_movements (user_id, product_id, direction, qty, reason, ref_type, ref_id, note, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, productId, direction, qty, reason, refType || null, refId || null, note || null, createdBy || null);
  const delta = direction === 'in' ? qty : -qty;
  db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?').run(delta, productId, userId);
  return db.prepare('SELECT stock FROM products WHERE id = ?').get(productId)?.stock ?? null;
};

// stock in (purchase / restock): inventory team or ops
app.post('/stock/in', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  if (!isOps(req.user) && req.user.dept !== 'inventory') return reply.code(403).send({ error: 'Only admin or inventory staff can add stock' });
  const { product_id, qty, note } = req.body || {};
  const prod = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(product_id, req.user.id);
  if (!prod) return reply.code(404).send({ error: 'Product not found' });
  const n = Number(qty);
  if (!(n > 0)) return reply.code(400).send({ error: 'qty must be a positive number' });
  const newStock = stockMove(req.user.id, prod.id, 'in', n, 'purchase', 'purchase', null, note || 'Stock purchase', req.user.staff_id);
  // real-time ping: sales reps + inventory team so everyone knows it's in
  const reps = db.prepare("SELECT id FROM staff WHERE user_id = ? AND department = 'sales'").all(req.user.id);
  for (const r of reps) notify(req.user.id, r.id, 'stock_update', `📥 ${n} × ${prod.name} added, ${newStock} on hand.`, { view: 'dashboard', dept: 'inventory' });
  const inv = db.prepare("SELECT id FROM staff WHERE user_id = ? AND department = 'inventory'").all(req.user.id);
  for (const s of inv) if (s.id !== req.user.staff_id) notify(req.user.id, s.id, 'stock_update', `📥 ${n} × ${prod.name} added, ${newStock} on hand.`, { view: 'inventory' });
  return { ok: true, stock: newStock };
});

// movement ledger (last N days, optional direction filter)
app.get('/stock/movements', { preHandler: requireAuth }, async (req) => {
  const days = Number(req.query.days) || 30;
  const dir = req.query.direction === 'in' || req.query.direction === 'out' ? req.query.direction : null;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = db.prepare(`SELECT m.*, p.name AS product_name, p.sku, s.name AS by_name
    FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN staff s ON s.id = m.created_by
    WHERE m.user_id = ? AND m.created_at >= ? ${dir ? 'AND m.direction = ?' : ''}
    ORDER BY m.id DESC LIMIT 200`).all(req.user.id, since, ...(dir ? [dir] : []));
  return { rows };
});

// internal mail / stock / receipts use the same ops gate as orders, declare it up front
const isOps = (u) => !u.dept || u.dept === 'account' || u.dept === 'hr';
const notify = (userId, staffId, kind, message, link) => {
  db.prepare('INSERT INTO notifications (user_id, staff_id, kind, message, link_json) VALUES (?, ?, ?, ?, ?)')
    .run(userId || null, staffId || null, kind, message, link ? JSON.stringify(link) : null);
};

// ---- internal mail (teams): threads, @mentions, and an order/approve/payment stream ----
const staffName = (id) => id ? (db.prepare('SELECT name FROM staff WHERE id = ?').get(id)?.name || null) : null;

// ---- modern chat interface: conversations (DMs + group channels) ----
const myChats = (userId, staffId, userDept) => {
  const me = staffId || 0; // owner (no staff row) is member id 0
  const convos = db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY id ASC').all(userId);
  return convos.filter((c) => {
    if (c.kind === 'dm') {
      const members = JSON.parse(c.member_json || '[]');
      return members.includes(me);
    }
    if (c.dept) {
      // department channel: members of that dept + owner (no dept) + HR
      return !userDept || userDept === 'hr' || userDept === c.dept;
    }
    return true; // General + user-created channels: everyone
  }).map((c) => ({
    ...c,
    members: JSON.parse(c.member_json || '[]'),
    last: db.prepare('SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(c.id),
  }));
};

const canAccessConv = (c, req) => {
  if (c.kind === 'dm') {
    const members = JSON.parse(c.member_json || '[]');
    return members.includes(req.user.staff_id || 0);
  }
  if (c.dept) return !req.user.dept || req.user.dept === 'hr' || req.user.dept === c.dept;
  return true;
};

app.get('/chat/conversations', { preHandler: requireAuth }, async (req) => {
  const staffList = db.prepare('SELECT id, name, department, role FROM staff WHERE user_id = ? AND can_login = 1 ORDER BY name').all(req.user.id);
  const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);
  // owner pseudo-contact so people can DM the CEO
  const contacts = req.user.dept
    ? [{ id: 0, name: owner?.name || 'CEO', department: 'owner', role: 'CEO / Owner' }, ...staffList]
    : staffList;
  return { conversations: myChats(req.user.id, req.user.staff_id, req.user.dept), staff: contacts };
});

// lightweight real-time: last message id per visible conversation (for unread badges + polling)
app.get('/chat/unread', { preHandler: requireAuth }, async (req) => {
  const convos = myChats(req.user.id, req.user.staff_id, req.user.dept);
  const me = req.user.staff_id || 0;
  let wm = {};
  try { wm = JSON.parse(req.query.watermarks || '{}') || {}; } catch { wm = {}; }
  const rows = convos.map((c) => {
    const mark = Number(wm[c.id]) || 0;
    const unseen = db.prepare('SELECT COUNT(*) AS c FROM conversation_messages WHERE conversation_id = ? AND id > ? AND COALESCE(sender_staff_id, 0) != ?')
      .get(c.id, mark, me).c;
    return {
      conversation_id: c.id,
      last_message_id: c.last ? c.last.id : 0,
      last_body: c.last ? String(c.last.body || '').slice(0, 60) : null,
      last_sender: c.last ? c.last.sender_staff_id : null,
      last_at: c.last ? c.last.created_at : null,
      unseen,
    };
  });
  return { rows };
});

app.get('/chat/conversations/:id', { preHandler: requireAuth }, async (req, reply) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!c) return reply.code(404).send({ error: 'Conversation not found' });
  if (!canAccessConv(c, req)) return reply.code(403).send({ error: 'Not in this conversation' });
  const ownerName = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)?.name || null;
  const messages = db.prepare('SELECT m.*, s.name AS sender_name FROM conversation_messages m LEFT JOIN staff s ON s.id = m.sender_staff_id WHERE m.conversation_id = ? ORDER BY m.id ASC').all(c.id)
    .map((m) => ({ ...m, mentions: JSON.parse(m.mentions_json || '[]'), groups: JSON.parse(m.groups_json || '[]'), sender_name: m.sender_name || (m.sender_staff_id === null ? ownerName : null) }));
  return { conversation: { ...c, members: JSON.parse(c.member_json || '[]') }, messages };
});

// create a DM with another staff, or a group channel
app.post('/chat/conversations', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  const { kind, with_staff_id, title, members } = req.body || {};
  if (kind === 'dm') {
    if (with_staff_id === undefined || with_staff_id === null) return reply.code(400).send({ error: 'with_staff_id required for DM' });
    const me = req.user.staff_id || 0;
    if (with_staff_id === me) return reply.code(400).send({ error: 'Cannot DM yourself' });
    let otherName;
    if (with_staff_id === 0) {
      otherName = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)?.name || 'CEO';
    } else {
      const other = db.prepare('SELECT id, name FROM staff WHERE id = ? AND user_id = ?').get(with_staff_id, req.user.id);
      if (!other) return reply.code(404).send({ error: 'Staff not found' });
      otherName = other.name;
    }
    const mem = JSON.stringify([me, with_staff_id].sort((a, b) => a - b));
    // reuse existing DM if present
    const existing = db.prepare('SELECT * FROM conversations WHERE user_id = ? AND kind = ? AND member_json = ?').get(req.user.id, 'dm', mem);
    if (existing) return { ok: true, id: existing.id, reused: true };
    const info = db.prepare('INSERT INTO conversations (user_id, kind, title, member_json) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'dm', otherName, mem);
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
  if (!canAccessConv(c, req)) return reply.code(403).send({ error: 'Not in this conversation' });
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

// seed "General" + one channel per department on first access if missing
app.get('/chat/ensure-general', { preHandler: requireAuth }, async (req) => {
  const has = db.prepare("SELECT id FROM conversations WHERE user_id = ? AND kind = 'group' AND title = 'General'").get(req.user.id);
  if (!has) {
    const staffIds = db.prepare('SELECT id FROM staff WHERE user_id = ?').all(req.user.id).map((s) => s.id);
    db.prepare("INSERT INTO conversations (user_id, kind, title, member_json) VALUES (?, 'group', 'General', ?)")
      .run(req.user.id, JSON.stringify(staffIds));
  }
  // departmental channels: # Sales, # Support, # Inventory, # HR, # Account
  const depts = ['sales', 'support', 'inventory', 'hr', 'account'];
  const titles = { sales: 'Sales', support: 'Support', inventory: 'Inventory', hr: 'HR', account: 'Account' };
  for (const d of depts) {
    const exists = db.prepare('SELECT id FROM conversations WHERE user_id = ? AND dept = ?').get(req.user.id, d);
    if (!exists) {
      const members = db.prepare('SELECT id FROM staff WHERE user_id = ? AND department = ?').all(req.user.id, d).map((s) => s.id);
      db.prepare("INSERT INTO conversations (user_id, kind, title, dept, member_json) VALUES (?, 'group', ?, ?, ?)")
        .run(req.user.id, titles[d], d, JSON.stringify(members));
    }
  }
  return { conversations: myChats(req.user.id, req.user.staff_id, req.user.dept) };
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
  for (const r of reps) notify(req.user.id, r.id, 'stock_update', `Stock updated: ${product_name}, ${Number(qty_on_hand)} on hand.`, { view: 'dashboard', dept: 'inventory' });
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
      notify(req.user.id, r.staff_id, 'payment_received', `Payment matched for invoice #${invoice_id}, receipt from ${r.payer_name}.`, { view: 'invoices', id: invoice_id });
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
  // pricing authority: ops may set the final price at approval (custom orders + discount adjustments)
  const finalTotal = Number(req.body?.final_total_ngn) > 0 ? Number(req.body?.final_total_ngn) : o.total_ngn;
  if (finalTotal !== o.total_ngn) {
    db.prepare('UPDATE orders SET total_ngn = ? WHERE id = ?').run(finalTotal, o.id);
  }
  // auto-raise the invoice (draft -> visible to the rep when delivered)
  const n = db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE user_id = ?').get(req.user.id).c;
  const number = `INV-2026-${String(n + 1).padStart(3, '0')}`;
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const inv = db.prepare(`INSERT INTO invoices (user_id, contact_id, number, status, issue_date, due_date, subtotal, total, tax_rate, tax, currency, fx_rate, ngn_total)
    VALUES (?, ?, ?, 'draft', date('now'), ?, ?, ?, 7.5, ?, 'NGN', 1, ?)`)
    .run(req.user.id, o.contact_id, number, due, finalTotal, finalTotal * 1.075, finalTotal * 0.075, finalTotal);
  for (const it of items) {
    db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, amount, product_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(inv.lastInsertRowid, it.name, it.qty, it.price, (Number(it.price) || 0) * (Number(it.qty) || 0), it.product_id || null);
  }
  db.prepare("UPDATE orders SET status = 'approved', invoice_id = ?, approved_at = datetime('now') WHERE id = ?")
    .run(inv.lastInsertRowid, o.id);
  notify(o.user_id, o.staff_id, 'order_approved',
    `Order #${o.id} approved, invoice ${number} raised for ${contact.company || contact.name}.`,
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
  // ---- stock deduction: delivery confirmation is the moment goods leave the store ----
  if (o.kind !== 'custom') {
    const items = JSON.parse(o.items_json || '[]');
    for (const it of items) {
      if (!it.product_id || !(Number(it.qty) > 0)) continue;
      const onHand = db.prepare('SELECT stock FROM products WHERE id = ?').get(it.product_id)?.stock ?? 0;
      const note = Number(it.qty) > onHand ? `Insufficient stock at delivery (had ${onHand}), investigate` : null;
      stockMove(o.user_id, it.product_id, 'out', Number(it.qty), 'sale', 'order', o.id, note, req.user.staff_id);
    }
    if (o.invoice_id) db.prepare('UPDATE invoices SET stock_moved = 1 WHERE id = ?').run(o.invoice_id);
  }
  notify(o.user_id, o.staff_id, 'order_delivered',
    `Order #${o.id} delivered, your invoice ${o.invoice_id ? '#' + o.invoice_id : ''} is now visible in your portal.`,
    { view: 'orders', id: o.id });
  return { ok: true };
});

app.post('/orders/:id/payment', { preHandler: requireAuth }, async (req, reply) => {
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin/accountant/HR can post payments' });
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return reply.code(404).send({ error: 'Order not found' });
  if (o.status !== 'delivered') return reply.code(400).send({ error: `Cannot take payment for an order that is ${o.status}, it must be delivered first` });
  const { ref } = req.body || {};
  db.prepare("UPDATE orders SET status = 'paid', payment_ref = ?, paid_at = datetime('now') WHERE id = ?").run(ref || null, o.id);
  if (o.invoice_id) db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(o.invoice_id);
  walletMove(o.user_id, 'in', o.total_ngn, 'payment', 'order', o.id, `Order #${o.id} payment${ref ? ' ' + ref : ''}`, req.user.staff_id, 'completed');
  notify(o.user_id, o.staff_id, 'payment_received',
    `Payment received for order #${o.id} (${o.total_ngn.toLocaleString()} naira)${ref ? ' ref ' + ref : ''}.`,
    { view: 'orders', id: o.id });
  return { ok: true };
});

app.get('/inventory-updates', { preHandler: requireAuth }, async (req) => {
  const rows = db.prepare(`SELECT * FROM notifications
    WHERE kind = 'inventory_digest' AND (staff_id = ? OR (staff_id IS NULL AND user_id = ?))
    ORDER BY id DESC LIMIT 20`)
    .all(req.user.staff_id || null, req.user.id)
    .map((n) => ({ ...n, link: n.link_json ? JSON.parse(n.link_json) : null }));
  return { rows };
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

// ---- inventory AI digest: what came in, what was sold, what's low, per period ---- 
const DIGEST_PERIODS = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, biannual: 182, year: 365 };
const DIGEST_LABELS = { daily: 'Today', weekly: 'This week', monthly: 'This month', quarterly: 'This quarter', biannual: 'This half-year', year: 'This year' };

const buildInventoryDigest = (userId, period) => {
  const days = DIGEST_PERIODS[period] || 1;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const moves = db.prepare(`SELECT m.*, p.name AS product_name FROM stock_movements m JOIN products p ON p.id = m.product_id
    WHERE m.user_id = ? AND m.created_at >= ? ORDER BY m.id DESC`).all(userId, since);
  const ins = moves.filter((m) => m.direction === 'in');
  const outs = moves.filter((m) => m.direction === 'out');
  const sumQty = (arr) => arr.reduce((s, m) => s + Number(m.qty), 0);
  const prods = db.prepare('SELECT * FROM products WHERE user_id = ?').all(userId);
  const low = prods.filter((p) => p.stock <= p.low_stock_at);
  const soldMap = {};
  for (const m of outs) soldMap[m.product_name] = (soldMap[m.product_name] || 0) + Number(m.qty);
  return {
    period, label: DIGEST_LABELS[period], since,
    added: sumQty(ins), sold: sumQty(outs),
    additions: ins.slice(0, 5).map((m) => ({ product: m.product_name, qty: m.qty, at: m.created_at })),
    sold_items: Object.entries(soldMap).map(([product, qty]) => ({ product, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5),
    low_count: low.length,
    low_items: low.slice(0, 5).map((p) => ({ product: p.name, stock: p.stock, alert_at: p.low_stock_at })),
    stock_value: prods.reduce((s, p) => s + p.stock * p.unit_cost, 0),
    skus: prods.length,
    negatives: prods.filter((p) => p.stock < 0).map((p) => p.name),
  };
};

app.get('/ai/inventory-digest', { preHandler: requireAuth }, async (req) => {
  const period = Object.keys(DIGEST_PERIODS).includes(req.query.period) ? req.query.period : 'daily';
  return { digest: buildInventoryDigest(req.user.id, period) };
});

// push a digest to its audiences: EVERYONE sees the same company-wide inventory updates
const pushDigest = (uid, d) => {
  const headline = d.period === 'daily'
    ? `Inventory today: +${d.added} in · −${d.sold} out`
    : `${d.label} inventory: +${d.added} in · −${d.sold} out`;
  const bits = [headline];
  if (d.low_count) bits.push(`${d.low_count} low-stock: ${d.low_items.map((i) => `${i.product} (${i.stock})`).join(', ')}`);
  if (d.negatives.length) bits.push(`Negative stock: ${d.negatives.join(', ')}`);
  bits.push(`Stock value ₦${Number(d.stock_value).toLocaleString()}`);
  const message = bits.join(' · ');
  const link = { view: 'inventory', period: d.period };
  const staffs = db.prepare('SELECT id FROM staff WHERE user_id = ?').all(uid);
  for (const s of staffs) notify(uid, s.id, 'inventory_digest', message, link);
  notify(uid, null, 'inventory_digest', message, link); // owner / CEO
};

// in-app scheduler: every tick, if it's the 08:00–08:59 Lagos window, fire due digests per org
const lagosNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
const digestKey = (period, now) => {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  if (period === 'daily') return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  if (period === 'weekly') { const wk = Math.floor((d - 1) / 7); return `${y}-${m}-w${wk + 1}`; }
  if (period === 'monthly') return `${y}-${m}`;
  if (period === 'quarterly') return `${y}-q${Math.floor(m / 3.0001) + 1}`;
  if (period === 'biannual') return `${y}-h${m <= 6 ? 1 : 2}`;
  return `${y}`;
};
const digestDueOn = (period, now) => {
  if (period === 'daily') return true;
  if (period === 'weekly') return now.getDay() === 1;                     // Mondays
  if (period === 'monthly') return now.getDate() === 1;                   // 1st
  if (period === 'quarterly') return now.getDate() === 1 && [0, 3, 6, 9].includes(now.getMonth()); // Jan/Apr/Jul/Oct 1
  if (period === 'biannual') return now.getDate() === 1 && [0, 6].includes(now.getMonth());        // Jan 1 / Jul 1
  return now.getDate() === 1 && now.getMonth() === 0;                     // Jan 1 (year-end)
};

const startDigestScheduler = () => {
  const tick = () => {
    try {
      const now = lagosNow();
      if (now.getHours() !== 8 && !process.env.DIGEST_TEST) return; // deliver within the 8am hour, Lagos time
      for (const u of db.prepare('SELECT id FROM users WHERE COALESCE(is_guest,0) = 0').all()) {
        const uid = u.id;
        const lastVal = (key) => db.prepare('SELECT value FROM org_settings WHERE user_id = ? AND key = ?').get(uid, key)?.value;
        const mark = (key, value) => db.prepare('INSERT INTO org_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value').run(uid, key, value);
        for (const period of ['daily', 'weekly', 'monthly', 'quarterly', 'biannual', 'year']) {
          if (!digestDueOn(period, now)) continue;
          const key = `digest_${period}`;
          const stamp = digestKey(period, now);
          if (lastVal(key) === stamp) continue;
          pushDigest(uid, buildInventoryDigest(uid, period));
          mark(key, stamp);
        }
      }
    } catch (err) { /* never let the scheduler kill the server */ }
  };
  setTimeout(tick, 8e3);
  setInterval(tick, 10 * 60e3); // every 10 minutes, fires inside the 8am window
};

// ---- wallet: the org's in-app money, with an in/out ledger ----
const ensureWallet = (userId) => {
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance_ngn) VALUES (?, 0)').run(userId);
  return db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
};
const walletMove = (userId, direction, amount, kind, refType, refId, note, createdBy, status) => {
  ensureWallet(userId);
  const delta = direction === 'in' ? amount : -amount;
  db.prepare('UPDATE wallets SET balance_ngn = balance_ngn + ? WHERE user_id = ?').run(delta, userId);
  const info = db.prepare(`INSERT INTO wallet_transactions (user_id, direction, amount_ngn, kind, ref_type, ref_id, note, created_by, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, direction, amount, kind, refType || null, refId || null, note || null, createdBy || null, status || null);
  return { id: info.lastInsertRowid, balance: db.prepare('SELECT balance_ngn FROM wallets WHERE user_id = ?').get(userId).balance_ngn };
};

app.get('/wallet', { preHandler: requireAuth }, async (req) => {
  const w = ensureWallet(req.user.id);
  const txs = db.prepare(`SELECT t.*, s.name AS by_name FROM wallet_transactions t LEFT JOIN staff s ON s.id = t.created_by
    WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 50`).all(req.user.id);
  return { wallet: w, transactions: txs, demo: !paystackEnabled() };
});

app.post('/wallet/topup', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin or accounts can top up the wallet' });
  const { amount_ngn, note } = req.body || {};
  const n = Number(amount_ngn);
  if (!(n > 0)) return reply.code(400).send({ error: 'amount_ngn must be a positive number' });
  const r = walletMove(req.user.id, 'in', n, 'topup', null, null, note || 'Manual top-up', req.user.staff_id, 'completed');
  notify(req.user.id, null, 'wallet', `Wallet topped up ₦${n.toLocaleString()}. Balance ₦${r.balance.toLocaleString()}.`, { view: 'wallet' });
  return r;
});

app.post('/wallet/payout', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.guest) return reply.code(403).send({ error: 'Read-only guest' });
  if (!isOps(req.user)) return reply.code(403).send({ error: 'Only admin or accounts can move money out' });
  const { amount_ngn, destination, note } = req.body || {};
  const n = Number(amount_ngn);
  if (!(n > 0)) return reply.code(400).send({ error: 'amount_ngn must be a positive number' });
  const w = ensureWallet(req.user.id);
  if (w.balance_ngn < n) return reply.code(400).send({ error: `Insufficient wallet balance (₦${Number(w.balance_ngn).toLocaleString()})` });
  const status = paystackEnabled() ? 'requested' : 'completed';
  const r = walletMove(req.user.id, 'out', n, 'payout', null, null,
    `${destination ? destination + ' ' : ''}${note || 'Payout'}${paystackEnabled() ? '' : ' (demo mode)'}`, req.user.staff_id, status);
  notify(req.user.id, null, 'wallet',
    `Payout ₦${n.toLocaleString()} ${status === 'completed' ? 'processed' : 'requested'}${destination ? ' to ' + destination : ''}. Balance ₦${r.balance.toLocaleString()}.`,
    { view: 'wallet' });
  return r;
});

// ---- expenses ledger ----
const EXPENSE_CATEGORIES = ['Utilities', 'Rent', 'Salaries & Wages', 'Equipment', 'Transport', 'Marketing', 'Supplies', 'Maintenance', 'Training', 'Miscellaneous'];
const expenseSeeAll = (u) => !u.dept || ['account', 'hr'].includes(u.dept) || u.platform || u.platform_only;

app.post('/expenses', { preHandler: requireAuth }, async (req, reply) => {
  const { category, description, amount_ngn, expense_date } = req.body || {};
  const amount = Number(amount_ngn);
  if (!amount || amount <= 0) return reply.code(400).send({ error: 'A positive amount_ngn is required' });
  const info = db.prepare('INSERT INTO expenses (user_id, staff_id, category, description, amount_ngn, expense_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, req.user.staff_id || null, category || 'Miscellaneous', description || '', amount, expense_date || new Date().toISOString().slice(0, 10));
  return { expense: db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid) };
});

app.get('/expenses', { preHandler: requireAuth }, async (req, reply) => {
  const { month, from, to } = req.query || {};
  const seeAll = expenseSeeAll(req.user);
  let rows;
  if (from && to) {
    // range filter: month (YYYY-MM) or full date (YYYY-MM-DD), capped at 12 months
    const f = from.length === 7 ? from + '-01' : from;
    const t = to.length === 7 ? to + '-31' : to;
    const spanDays = (new Date(t) - new Date(f)) / 86400000;
    if (spanDays < 0 || spanDays > 365) return reply.code(400).send({ error: 'Range must be within 12 months' });
    const base = `SELECT e.*, s.name AS staff_name FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date <= ?`;
    rows = seeAll
      ? db.prepare(`${base} ORDER BY e.expense_date DESC, e.id DESC`).all(req.user.id, f, t)
      : db.prepare(`${base} AND e.staff_id = ? ORDER BY e.expense_date DESC, e.id DESC`).all(req.user.id, f, t, req.user.staff_id);
  } else if (month) {
    rows = seeAll
      ? db.prepare(`SELECT e.*, s.name AS staff_name FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.user_id = ? AND strftime('%Y-%m', e.expense_date) = ? ORDER BY e.expense_date DESC, e.id DESC`).all(req.user.id, month)
      : db.prepare(`SELECT e.*, s.name AS staff_name FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.user_id = ? AND e.staff_id = ? AND strftime('%Y-%m', e.expense_date) = ? ORDER BY e.expense_date DESC, e.id DESC`).all(req.user.id, req.user.staff_id, month);
  } else {
    rows = seeAll
      ? db.prepare(`SELECT e.*, s.name AS staff_name FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.user_id = ? ORDER BY e.expense_date DESC, e.id DESC LIMIT 200`).all(req.user.id)
      : db.prepare(`SELECT e.*, s.name AS staff_name FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.user_id = ? AND e.staff_id = ? ORDER BY e.expense_date DESC, e.id DESC LIMIT 200`).all(req.user.id, req.user.staff_id);
  }
  return { expenses: rows, categories: EXPENSE_CATEGORIES, see_all: seeAll };
});

app.get('/expenses/report', { preHandler: requireAuth }, async (req, reply) => {
  if (!expenseSeeAll(req.user)) return reply.code(403).send({ error: 'The account department sees the expense report.' });
  const { month, from, to } = req.query || {};
  let rows;
  if (from && to) {
    const f = from.length === 7 ? from + '-01' : from;
    const t = to.length === 7 ? to + '-31' : to;
    const spanDays = (new Date(t) - new Date(f)) / 86400000;
    if (spanDays < 0 || spanDays > 365) return reply.code(400).send({ error: 'Range must be within 12 months' });
    rows = db.prepare(`SELECT category, SUM(amount_ngn) AS total, COUNT(*) AS n FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date <= ? GROUP BY category ORDER BY total DESC`)
      .all(req.user.id, f, t);
  } else {
    rows = db.prepare(`SELECT category, SUM(amount_ngn) AS total, COUNT(*) AS n FROM expenses WHERE user_id = ? AND strftime('%Y-%m', expense_date) = ? GROUP BY category ORDER BY total DESC`).all(req.user.id, month);
  }
  const total = rows.reduce((s, r) => s + (r.total || 0), 0);
  return { month: from && to ? `${from} → ${to}` : month, total: Math.round(total), by_category: rows };
});

app.delete('/expenses/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return reply.code(404).send({ error: 'Expense not found' });
  if (!expenseSeeAll(req.user) && existing.staff_id !== req.user.staff_id) return reply.code(403).send({ error: 'You can only delete your own expenses' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  return { ok: true };
});

// ---- multi-channel inbox (whatsapp + instagram + messenger + tiktok + email) ----
const INBOX_CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'messenger', label: 'Facebook Messenger' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'email', label: 'Email' },
];

app.get('/inbox/channels', { preHandler: requireAuth }, async (req) => {
  const { cfg } = tierOf(req.user.id);
  const allowed = cfg.channels;
  const rows = db.prepare('SELECT * FROM inbox_channels WHERE user_id = ?').all(req.user.id);
  const map = Object.fromEntries(rows.map((r) => [r.channel, r]));
  const unread = db.prepare("SELECT channel, COUNT(*) AS n FROM messages WHERE user_id = ? AND direction = 'in' AND read = 0 GROUP BY channel").all(req.user.id);
  const unreadMap = Object.fromEntries(unread.map((r) => [r.channel, r.n]));
  const channels = INBOX_CHANNELS.filter((c) => allowed.includes(c.key)).map((c) => {
    const st = c.key === 'whatsapp' && waEnabled() ? 'connected' : (map[c.key]?.status || 'disconnected');
    return {
      ...c,
      status: st,
      unread: unreadMap[c.key] || 0,
      account_id: map[c.key]?.account_id || null,
      connected_at: map[c.key]?.connected_at || null,
    };
  });
  return { channels };
});

app.post('/inbox/channels/:channel/connect', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept) return reply.code(403).send({ error: 'Only the organization owner can connect channels.' });
  const ch = INBOX_CHANNELS.find((c) => c.key === req.params.channel);
  if (!ch) return reply.code(404).send({ error: 'Unknown channel' });
  const { cfg } = tierOf(req.user.id);
  if (!cfg.channels.includes(ch.key)) return reply.code(403).send({ error: `${ch.label} is not included in your ${cfg.label} plan. Upgrade to unlock it.` });
  const { account_id } = req.body || {};
  db.prepare(`INSERT INTO inbox_channels (user_id, channel, status, account_id, connected_at) VALUES (?, ?, 'connected', ?, datetime('now'))
    ON CONFLICT(user_id, channel) DO UPDATE SET status = 'connected', account_id = excluded.account_id, connected_at = datetime('now'), updated_at = datetime('now')`)
    .run(req.user.id, ch.key, account_id || null);
  return { ok: true, channel: ch.key, status: 'connected' };
});

app.post('/inbox/channels/:channel/disconnect', { preHandler: requireAuth }, async (req, reply) => {
  if (req.user.dept) return reply.code(403).send({ error: 'Only the organization owner can disconnect channels.' });
  const ch = INBOX_CHANNELS.find((c) => c.key === req.params.channel);
  if (!ch) return reply.code(404).send({ error: 'Unknown channel' });
  db.prepare(`INSERT INTO inbox_channels (user_id, channel, status, account_id) VALUES (?, ?, 'disconnected', NULL)
    ON CONFLICT(user_id, channel) DO UPDATE SET status = 'disconnected', account_id = NULL, updated_at = datetime('now')`)
    .run(req.user.id, ch.key);
  return { ok: true, channel: ch.key, status: 'disconnected' };
});

// inbound webhooks for Meta (Instagram + Messenger) and TikTok, live once business verification lands
app.post('/webhooks/meta', async (req, reply) => {
  for (const e of req.body?.entry || []) {
    const events = [...(e.messaging || []), ...((e.changes || []).map((c) => c.value))];
    for (const ev of events) {
      const sender = ev.sender?.id || ev.from?.id || '';
      const msg = ev.message;
      const channel = e.messaging ? 'messenger' : 'instagram';
      const conn = db.prepare(`SELECT user_id FROM inbox_channels WHERE channel = ? AND status != 'disconnected' LIMIT 1`).get(channel);
      if (!conn || !sender || !msg?.text) continue;
      let contact = db.prepare('SELECT id FROM contacts WHERE user_id = ? AND (email = ? OR phone LIKE ?) LIMIT 1').get(conn.user_id, sender, `%${sender.slice(-8)}%`);
      if (!contact) {
        const info = db.prepare("INSERT INTO contacts (user_id, name, phone, tags) VALUES (?, ?, ?, 'lead')").run(conn.user_id, `${channel === 'instagram' ? 'IG' : 'Messenger'} contact ${sender.slice(-4)}`, sender);
        contact = { id: info.lastInsertRowid };
      }
      db.prepare("INSERT INTO messages (user_id, contact_id, direction, body, status, read, channel) VALUES (?, ?, 'in', ?, 'received', 0, ?)")
        .run(conn.user_id, contact.id, msg.text, channel);
    }
  }
  return { ok: true };
});

app.post('/webhooks/tiktok', async (req, reply) => {
  const msg = req.body?.message;
  if (!msg?.sender_id || !msg?.text) return { ok: true };
  const conn = db.prepare(`SELECT user_id FROM inbox_channels WHERE channel = 'tiktok' AND status != 'disconnected' LIMIT 1`).get();
  if (!conn) return { ok: true };
  let contact = db.prepare('SELECT id FROM contacts WHERE user_id = ? AND (email = ? OR phone LIKE ?) LIMIT 1').get(conn.user_id, msg.sender_id, `%${msg.sender_id.slice(-8)}%`);
  if (!contact) {
    const info = db.prepare("INSERT INTO contacts (user_id, name, phone, tags) VALUES (?, ?, ?, 'lead')").run(conn.user_id, `TikTok contact ${msg.sender_id.slice(-4)}`, msg.sender_id);
    contact = { id: info.lastInsertRowid };
  }
  db.prepare("INSERT INTO messages (user_id, contact_id, direction, body, status, read, channel) VALUES (?, ?, 'in', ?, 'received', 0, 'tiktok')")
    .run(conn.user_id, contact.id, msg.text);
  return { ok: true };
});

// ---- health ----
app.get('/health', async () => ({ ok: true, service: 'omnicrm-api', time: new Date().toISOString() }));

// ---- internal: accounts-sheet sync queue (host-local sync script pulls + appends to the live sheet) ----
const SYNC_SECRET = process.env.SYNC_SECRET || 'omnicrm-sync-local';
app.get('/internal/sync-queue', async (req, reply) => {
  if (req.headers['x-sync-secret'] !== SYNC_SECRET) return reply.code(403).send({ error: 'Forbidden' });
  const rows = db.prepare('SELECT * FROM sheet_sync_queue WHERE synced = 0 ORDER BY id ASC LIMIT 50').all();
  return { rows };
});
app.post('/internal/sync-queue/ack', async (req, reply) => {
  if (req.headers['x-sync-secret'] !== SYNC_SECRET) return reply.code(403).send({ error: 'Forbidden' });
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return reply.code(400).send({ error: 'ids array required' });
  const stmt = db.prepare('UPDATE sheet_sync_queue SET synced = 1 WHERE id = ?');
  for (const id of ids) stmt.run(id);
  return { ok: true, synced: ids.length };
});

// ---- platform (super-admin) console: the vendor above all orgs ----
const platformOnly = (req, reply, done) => (req.user.platform_only ? done() : reply.code(403).send({ error: 'Platform admins only' }));
const audit = (adminId, action, targetId, detail) => {
  db.prepare('INSERT INTO platform_audit (admin_id, action, target_id, detail) VALUES (?, ?, ?, ?)')
    .run(adminId, action, targetId || null, detail || null);
};

app.get('/platform/summary', { preHandler: [requireAuth, platformOnly] }, async (req) => {
  const count = (sql) => db.prepare(sql).get().c;
  const sum = (sql) => db.prepare(sql).get().v || 0;
  return {
    orgs: count('SELECT COUNT(*) c FROM users WHERE COALESCE(platform_only,0) = 0 AND COALESCE(is_guest,0) = 0'),
    guests: count('SELECT COUNT(*) c FROM users WHERE COALESCE(is_guest,0) = 1'),
    staff: count('SELECT COUNT(*) c FROM staff'),
    contacts: count('SELECT COUNT(*) c FROM contacts'),
    invoices_paid_value: sum('SELECT COALESCE(SUM(ngn_total),0) v FROM invoices WHERE status = \'paid\''),
    wallet_balances: sum('SELECT COALESCE(SUM(balance_ngn),0) v FROM wallets'),
    ai_calls_today: count("SELECT COUNT(*) c FROM ai_audit WHERE created_at >= date('now')"),
  };
});

app.get('/platform/orgs', { preHandler: [requireAuth, platformOnly] }, async (req) => {
  const orgs = db.prepare('SELECT id, email, name, business_name, is_guest, created_at FROM users WHERE COALESCE(platform_only,0) = 0 AND COALESCE(is_guest,0) = 0 ORDER BY id').all()
    .map((o) => ({
      ...o,
      staff: db.prepare('SELECT COUNT(*) AS c FROM staff WHERE user_id = ?').get(o.id).c,
      contacts: db.prepare('SELECT COUNT(*) AS c FROM contacts WHERE user_id = ?').get(o.id).c,
      invoices: db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE user_id = ?').get(o.id).c,
      features: orgFeatures(o.id),
    }));
  return { orgs };
});

app.post('/platform/impersonate', { preHandler: [requireAuth, platformOnly] }, async (req, reply) => {
  const { user_id } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND COALESCE(is_guest,0) = 0').get(user_id);
  if (!u) return reply.code(404).send({ error: 'Organization not found' });
  audit(req.user.id, 'impersonate', u.id, `Signed in as ${u.business_name || u.email}`);
  const token = jwt.sign({ id: u.id, email: u.email, name: u.name, guest: !!u.is_guest, imp_by: req.user.id }, JWT_SECRET, { expiresIn: '2h' });
  return { token };
});

app.post('/platform/orgs/:id/password', { preHandler: [requireAuth, platformOnly] }, async (req, reply) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return reply.code(404).send({ error: 'Organization not found' });
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 8) return reply.code(400).send({ error: 'new_password must be at least 8 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(new_password), 10), u.id);
  audit(req.user.id, 'reset_password', u.id, `Password reset for ${u.business_name || u.email}`);
  return { ok: true };
});

app.put('/platform/orgs/:id/features', { preHandler: [requireAuth, platformOnly] }, async (req, reply) => {
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!u) return reply.code(404).send({ error: 'Organization not found' });
  const features = req.body?.features;
  if (!features || typeof features !== 'object') return reply.code(400).send({ error: 'features object is required' });
  db.prepare("INSERT INTO org_settings (user_id, key, value) VALUES (?, 'features', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value")
    .run(u.id, JSON.stringify(features));
  audit(req.user.id, 'update_features', u.id, JSON.stringify(features));
  return { features };
});

app.get('/platform/audit', { preHandler: [requireAuth, platformOnly] }, async (req) => {
  const rows = db.prepare(`SELECT a.*, u.email AS admin_email FROM platform_audit a JOIN users u ON u.id = a.admin_id
    ORDER BY a.id DESC LIMIT 50`).all();
  return { rows };
});

// ---- demo links live in the platform console; orgs cannot create them ----
app.get('/platform/demo-links', { preHandler: [requireAuth, platformOnly] }, async (req) => {
  const rows = db.prepare(`SELECT d.*, u.email, u.business_name FROM demo_links d JOIN users u ON u.id = d.user_id ORDER BY d.id DESC`).all();
  return { links: rows };
});

app.post('/platform/demo-links', { preHandler: [requireAuth, platformOnly] }, async (req, reply) => {
  const { user_id, label } = req.body || {};
  const u = db.prepare('SELECT id, email FROM users WHERE id = ? AND COALESCE(platform_only,0) = 0 AND COALESCE(is_guest,0) = 0').get(user_id);
  if (!u) return reply.code(404).send({ error: 'Organization not found' });
  const token = `${randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const info = db.prepare('INSERT INTO demo_links (user_id, token, label) VALUES (?, ?, ?)').run(u.id, token, label || null);
  audit(req.user.id, 'create_demo_link', u.id, label || `demo link for ${u.email}`);
  return { link: db.prepare('SELECT * FROM demo_links WHERE id = ?').get(info.lastInsertRowid), url: `/demo.html?token=${token}` };
});

app.post('/platform/demo-links/:id/revoke', { preHandler: [requireAuth, platformOnly] }, async (req, reply) => {
  const existing = db.prepare('SELECT * FROM demo_links WHERE id = ?').get(req.params.id);
  if (!existing) return reply.code(404).send({ error: 'Link not found' });
  db.prepare("UPDATE demo_links SET active = 0, revoked_at = datetime('now') WHERE id = ?").run(req.params.id);
  audit(req.user.id, 'revoke_demo_link', existing.user_id, existing.label || existing.token);
  return { ok: true };
});

// ---- super admin returns from an impersonated org session back to the platform ----
app.post('/platform/exit', { preHandler: requireAuth }, async (req, reply) => {
  const impBy = req.user.imp_by;
  if (!impBy) return reply.code(400).send({ error: 'Not an impersonated session' });
  const admin = db.prepare('SELECT * FROM users WHERE id = ? AND is_platform = 1').get(impBy);
  if (!admin) return reply.code(403).send({ error: 'Platform admin no longer valid' });
  audit(admin.id, 'exit_impersonation', req.user.id, `Returned to platform from ${req.user.email}`);
  const token = jwt.sign({ id: admin.id, email: admin.email, name: admin.name, guest: !!admin.is_guest, platform: 1, platform_only: !!admin.platform_only }, JWT_SECRET, { expiresIn: '7d' });
  return { token };
});

startDigestScheduler();

const PORT = process.env.PORT || 4200;
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`OmniCRM API running on http://localhost:${PORT}`);
});
