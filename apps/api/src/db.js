// OmniCRM database layer — Node's built-in SQLite (no native deps).
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'omnicrm.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  business_name TEXT NOT NULL DEFAULT 'My Business',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  tags TEXT NOT NULL DEFAULT 'lead',
  status TEXT NOT NULL DEFAULT 'new',
  debt_ngn INTEGER NOT NULL DEFAULT 0,
  deal_value_ngn INTEGER NOT NULL DEFAULT 0,
  next_action TEXT,
  next_followup_date TEXT,
  last_contacted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contact_id INTEGER REFERENCES contacts(id),
  kind TEXT NOT NULL,           -- call | email | whatsapp | visit | note | sale
  channel TEXT,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contact_id INTEGER REFERENCES contacts(id),
  title TEXT NOT NULL,
  value_ngn INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'lead',  -- lead | proposal_sent | negotiation | won | lost
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  direction TEXT NOT NULL DEFAULT 'out',   -- in | out
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',     -- draft | sent | failed
  read INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT DEFAULT 'General',
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_at INTEGER NOT NULL DEFAULT 5,
  unit_cost REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contact_id INTEGER REFERENCES contacts(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | pending | closed
  priority TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contact_id INTEGER REFERENCES contacts(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT NOT NULL DEFAULT 'sales',  -- sales | support | inventory | hr | account
  role TEXT NOT NULL DEFAULT 'Staff',
  salary REAL NOT NULL DEFAULT 0,
  bank TEXT,
  pension_rate REAL NOT NULL DEFAULT 8,      -- % of salary (contributory pension)
  hmo_plan TEXT,
  onboarding TEXT NOT NULL DEFAULT 'invited', -- invited | documents | orientation | active
  status TEXT NOT NULL DEFAULT 'active',     -- active | inactive
  can_login INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  next_of_kin TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_user ON staff(user_id);

CREATE TABLE IF NOT EXISTS salary_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  amount REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | repaid
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_advances_user ON salary_advances(user_id);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  type TEXT NOT NULL DEFAULT 'annual',      -- annual | sick | maternity | paternity | unpaid
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);

CREATE TABLE IF NOT EXISTS org_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  period TEXT NOT NULL,               -- YYYY-MM
  status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | paid
  total_gross REAL NOT NULL DEFAULT 0,
  total_pension REAL NOT NULL DEFAULT 0,
  total_paye REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payroll_user ON payroll_runs(user_id);

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  gross REAL NOT NULL,
  pension REAL NOT NULL,              -- staff 8% contribution
  paye REAL NOT NULL,                 -- simplified PAYE tax
  other_deductions REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(run_id);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  date TEXT NOT NULL DEFAULT (date('now')),
  clock_in TEXT,
  clock_out TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id, date);

CREATE TABLE IF NOT EXISTS remittances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  period TEXT NOT NULL,                 -- YYYY-MM of the payroll run
  type TEXT NOT NULL,                   -- paye | pension
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid
  run_id INTEGER REFERENCES payroll_runs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_remit_user ON remittances(user_id);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  date TEXT NOT NULL,                   -- YYYY-MM-DD
  shift TEXT NOT NULL DEFAULT 'morning', -- morning | afternoon | night | off
  UNIQUE(staff_id, date)
);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id, date);

CREATE TABLE IF NOT EXISTS demo_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | paid | overdue
  issue_date TEXT NOT NULL DEFAULT (date('now')),
  due_date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items ON invoice_items(invoice_id);
`);

// migration: users.is_guest for read-only demo accounts
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes('is_guest')) db.exec('ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0');

// migration: commission engine — contact sales rep, staff rate, payslip line
const contactCols = db.prepare("PRAGMA table_info(contacts)").all().map((c) => c.name);
if (!contactCols.includes('staff_id')) db.exec('ALTER TABLE contacts ADD COLUMN staff_id INTEGER');
const staffCols = db.prepare("PRAGMA table_info(staff)").all().map((c) => c.name);
if (!staffCols.includes('commission_rate')) db.exec('ALTER TABLE staff ADD COLUMN commission_rate REAL NOT NULL DEFAULT 0');
const slipCols = db.prepare("PRAGMA table_info(payslips)").all().map((c) => c.name);
if (!slipCols.includes('commission')) db.exec('ALTER TABLE payslips ADD COLUMN commission REAL NOT NULL DEFAULT 0');
const runCols = db.prepare("PRAGMA table_info(payroll_runs)").all().map((c) => c.name);
if (!runCols.includes('total_commission')) db.exec('ALTER TABLE payroll_runs ADD COLUMN total_commission REAL NOT NULL DEFAULT 0');

// migration: pay_token for public pay links
import { randomUUID } from 'node:crypto';
const invCols = db.prepare("PRAGMA table_info(invoices)").all().map((c) => c.name);
if (!invCols.includes('pay_token')) db.exec('ALTER TABLE invoices ADD COLUMN pay_token TEXT');
for (const inv of db.prepare('SELECT id FROM invoices WHERE pay_token IS NULL').all()) {
  db.prepare('UPDATE invoices SET pay_token = ? WHERE id = ?').run(randomUUID(), inv.id);
}
// migration: multi-currency support (currency, fx_rate, ngn_total)
if (!invCols.includes('currency')) db.exec("ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'NGN'");
if (!invCols.includes('fx_rate')) db.exec('ALTER TABLE invoices ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1');
if (!invCols.includes('ngn_total')) {
  db.exec('ALTER TABLE invoices ADD COLUMN ngn_total REAL NOT NULL DEFAULT 0');
  db.exec('UPDATE invoices SET ngn_total = total WHERE ngn_total = 0');
}
// migration: conversion processing fee (revenue stream)
if (!invCols.includes('fee_rate')) db.exec('ALTER TABLE invoices ADD COLUMN fee_rate REAL NOT NULL DEFAULT 0');
if (!invCols.includes('fee')) db.exec('ALTER TABLE invoices ADD COLUMN fee REAL NOT NULL DEFAULT 0');
if (!invCols.includes('paid_at')) db.exec('ALTER TABLE invoices ADD COLUMN paid_at TEXT');

// migration: sales order workflow (orders + stage notifications)
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  staff_id INTEGER,
  contact_id INTEGER,
  items_json TEXT NOT NULL DEFAULT '[]',
  total_ngn REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  invoice_id INTEGER,
  payment_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  delivered_at TEXT,
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  staff_id INTEGER,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_staff ON orders(staff_id);
CREATE INDEX IF NOT EXISTS idx_notif_staff ON notifications(staff_id);
`);

export default db;
