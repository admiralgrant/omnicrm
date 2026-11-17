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
`);

export default db;
