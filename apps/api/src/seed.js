// Seed the demo account with the FMPP-flavoured dataset so the product
// feels alive on first login. Run: npm run seed (from apps/api)
import bcrypt from 'bcryptjs';
import db from './db.js';

const email = 'grant@besconpaints.com';
const password = 'omnicrm-demo';

let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
if (!user) {
  db.prepare('INSERT INTO users (email, name, password_hash, business_name) VALUES (?, ?, ?, ?)')
    .run(email, 'Grant Ojijieme', bcrypt.hashSync(password, 10), 'Bescon Paints');
  user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}
const uid = user.id;

const seedContacts = [
  { name: 'Procurement', company: 'Alpha Mead Group', phone: '07019999343', email: 'info@alphamead.com', tags: 'lead,vip', status: 'proposal_sent', deal_value_ngn: 2400000, next_action: 'Day-4 follow-up · FMPP proposal sent 16 Nov', next_followup_date: '2026-11-20' },
  { name: 'BD Team', company: 'GPFI', phone: '07059886922', email: 'bd@globalpfi.com', tags: 'lead,vip', status: 'proposal_sent', deal_value_ngn: 1800000, next_action: 'Proposal under review', next_followup_date: '2026-11-20' },
  { name: 'Facilities', company: 'Knight Frank Nigeria', phone: '07014962507', email: 'info@ng.knightfrank.com', tags: 'lead', status: 'proposal_sent', deal_value_ngn: 900000, next_action: 'First email sent 16 Nov', next_followup_date: '2026-11-20' },
  { name: 'Alhaji Bello', company: 'Alhaji Bello (Wholesaler)', phone: '08031234567', tags: 'debt', status: 'customer', debt_ngn: 150000, next_action: 'Collect 2 overdue invoices', next_followup_date: '2026-11-16' },
  { name: 'Mama Nkechi', company: 'Mama Nkechi Retail', phone: '08023456789', tags: 'debt', status: 'customer', debt_ngn: 18500, next_action: 'Collect 1 overdue invoice', next_followup_date: '2026-11-16' },
  { name: 'Chidi Motors', company: 'Chidi Motors Ltd', phone: '08098765432', tags: 'debt', status: 'customer', debt_ngn: 62000, next_action: 'Part payment pending', next_followup_date: null },
  { name: 'Mrs. Olapade', company: 'Prime Facilities Management', phone: '08033898555', tags: 'lead', status: 'proposal_sent', deal_value_ngn: 1100000, next_action: 'Proposal sent via WhatsApp — awaiting reply', next_followup_date: null },
  { name: 'Mr. El-Sultan', company: 'El-Sultan Facility Management', phone: '08169073666', tags: 'lead', status: 'proposal_sent', deal_value_ngn: 700000, next_action: 'Proposal sent via WhatsApp — awaiting reply', next_followup_date: null },
  { name: 'Eko Maintenance', company: 'Eko Maintenance Limited', phone: '08076275442', tags: 'lead', status: 'visit_due', deal_value_ngn: 1200000, next_action: 'Book in-person visit this week', next_followup_date: '2026-11-16' },
  { name: 'James Cubitt', company: 'James Cubitt Facilities Management', phone: '09166179000', tags: 'vip', status: 'proposal_sent', deal_value_ngn: 3100000, next_action: 'Proposal under review', next_followup_date: null },
];

for (const c of seedContacts) {
  db.prepare(`INSERT INTO contacts (user_id, name, company, phone, email, tags, status, debt_ngn, deal_value_ngn, next_action, next_followup_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uid, c.name, c.company, c.phone, c.email, c.tags, c.status, c.debt_ngn || 0, c.deal_value_ngn || 0, c.next_action, c.next_followup_date);
}

for (const [title, value, stage, company] of [
  ['FMPP Gold — Alpha Mead', 2400000, 'proposal_sent', 'Alpha Mead Group'],
  ['FMPP Platinum — GPFI', 1800000, 'proposal_sent', 'GPFI'],
  ['Estate repaint — Knight Frank', 900000, 'proposal_sent', 'Knight Frank Nigeria'],
  ['FMPP Enterprise — James Cubitt', 3100000, 'negotiation', 'James Cubitt Facilities Management'],
  ['Bulk supply — Eko Maintenance', 1200000, 'lead', 'Eko Maintenance Limited'],
]) {
  const contact = db.prepare('SELECT id FROM contacts WHERE company = ? AND user_id = ?').get(company, uid);
  db.prepare('INSERT INTO deals (user_id, contact_id, title, value_ngn, stage) VALUES (?, ?, ?, ?, ?)')
    .run(uid, contact ? contact.id : null, title, value, stage);
}

console.log(`Seeded demo data for ${email} / password: ${password}`);

// ---- seed WhatsApp threads so the inbox feels alive ----
const thread = (company, msgs) => {
  const c = db.prepare('SELECT id FROM contacts WHERE company = ? AND user_id = ?').get(company, uid);
  if (!c) return;
  for (const [dir, body, read] of msgs) {
    db.prepare('INSERT INTO messages (user_id, contact_id, direction, body, status, read) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, c.id, dir, body, 'sent', read);
  }
};

thread('GPFI', [
  ['in', 'Good morning. We received your proposal from the procurement team.', 1],
  ['out', 'Good morning! Thank you for confirming — happy to walk you through the tiers whenever you are ready.', 1],
  ['in', 'Management will review this week and revert.', 0],
]);

thread('El-Sultan Facility Management', [
  ['out', 'Hello Mr. El-Sultan, this is Grant from Bescon Paints. As requested, here is the FMPP proposal — free Silver tier with a N50,000 welcome bonus, 5–15% discounts, and referral commissions.', 1],
  ['in', 'Thanks, we will look at it.', 0],
]);

thread('Eko Maintenance Limited', [
  ['in', 'Kindly come to the office with the proposal. Ask for the Facilities Manager.', 0],
]);

thread('Alhaji Bello (Wholesaler)', [
  ['out', 'Alhaji, good afternoon. The two invoices from last month are now due — kindly confirm when payment will be made.', 1],
]);

thread('Mama Nkechi Retail', [
  ['in', 'I will pay by Friday, abeg.', 0],
  ['out', 'No problem, Mama. Friday is fine. Thank you!', 1],
]);

console.log('Seeded WhatsApp inbox threads.');

// ---- seed products + tickets for the department dashboards ----
const prods = [
  ['Emulsion Paint — Satin White 20L', 'P-EMU-20L', 'Emulsion', 140, 15, 18500, 24500],
  ['Emulsion Paint — Cream 4L', 'P-EMU-4L', 'Emulsion', 8, 10, 4300, 5900],
  ['Satin Paint — Ivory 20L', 'P-SAT-20L', 'Satin', 62, 10, 21500, 28900],
  ['Texcote — Sahara Beige 20L', 'P-TEX-20L', 'Texcote', 4, 8, 29800, 38500],
  ['Gloss — Brilliant White 4L', 'P-GLO-4L', 'Gloss', 55, 10, 3900, 5400],
  ['Screeding Paint — Grey 20L', 'P-SCR-20L', 'Screeding', 18, 8, 14900, 19500],
  ['Primer — Universal 4L', 'P-PRI-4L', 'Primer', 26, 10, 3200, 4500],
  ['Masonry Waterproof — Clear 20L', 'P-MAS-20L', 'Waterproof', 3, 6, 26500, 34000],
];
for (const [name, sku, cat, stock, low, cost, price] of prods) {
  db.prepare('INSERT INTO products (user_id, name, sku, category, stock, low_stock_at, unit_cost, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, name, sku, cat, stock, low, cost, price);
}

const tkt = (company, subject, status, priority) => {
  const c = db.prepare('SELECT id FROM contacts WHERE company = ? AND user_id = ?').get(company, uid);
  db.prepare('INSERT INTO tickets (user_id, contact_id, subject, status, priority) VALUES (?, ?, ?, ?, ?)')
    .run(uid, c ? c.id : null, subject, status, priority);
};
tkt('Eko Maintenance Limited', 'Paint delivery delayed for the Lekki Phase 2 site', 'open', 'high');
tkt('El-Sultan Facility Management', 'Need colour matching quote for 3 apartment blocks', 'open', 'medium');
tkt('GPFI', 'Invoice clarification — units billed vs delivered', 'pending', 'high');
tkt('Alhaji Bello (Wholesaler)', 'Re-order request for Texcote', 'closed', 'low');

console.log('Seeded products and support tickets.');

// ---- seed invoices ----
const inv = (company, number, status, issue, due, items, currency = 'NGN', fxRate = 1) => {
  const c = db.prepare('SELECT id FROM contacts WHERE company = ? AND user_id = ?').get(company, uid);
  if (!c) return;
  const subtotal = items.reduce((s, [d, q, up]) => s + q * up, 0);
  const tax = Math.round(subtotal * 0.075);
  const total = subtotal + tax;
  const feeRate = currency === 'NGN' ? 0 : 0.015; // conversion processing fee
  const fee = Math.round(total * feeRate);
  db.prepare('INSERT INTO invoices (user_id, contact_id, number, status, issue_date, due_date, subtotal, tax_rate, tax, total, currency, fx_rate, ngn_total, fee_rate, fee) VALUES (?, ?, ?, ?, ?, ?, ?, 7.5, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, c.id, number, status, issue, due, subtotal, tax, total, currency, fxRate, Math.round((total + fee) * fxRate), feeRate, fee);
  const invId = db.prepare('SELECT id FROM invoices WHERE number = ?').get(number).id;
  for (const [d, q, up] of items) {
    db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, unit_price, amount) VALUES (?, ?, ?, ?, ?)')
      .run(invId, d, q, up, q * up);
  }
};

inv('GPFI', 'INV-2026-001', 'sent', '2026-11-03', '2026-11-10', [
  ['Satin Paint — Ivory 20L', 40, 28900],
  ['Primer — Universal 4L', 20, 4500],
]);
inv('Eko Maintenance Limited', 'INV-2026-002', 'sent', '2026-11-10', '2026-11-25', [
  ['Texcote — Sahara Beige 20L', 25, 38500],
  ['Screeding Paint — Grey 20L', 10, 19500],
]);
inv('El-Sultan Facility Management', 'INV-2026-003', 'draft', '2026-11-16', '2026-12-01', [
  ['Emulsion Paint — Satin White 20L', 60, 24500],
]);
inv('Alhaji Bello (Wholesaler)', 'INV-2026-004', 'paid', '2026-10-20', '2026-10-27', [
  ['Gloss — Brilliant White 4L', 30, 5400],
  ['Emulsion Paint — Cream 4L', 12, 5900],
]);
inv('Mama Nkechi Retail', 'INV-2026-005', 'sent', '2026-11-14', '2026-11-20', [
  ['Emulsion Paint — Satin White 4L', 8, 5100],
]);
// international customer — USD invoice, converted at the live rate at creation
inv('Knight Frank Nigeria', 'INV-2026-006', 'sent', '2026-11-15', '2026-12-05', [
  ['Emulsion Paint — Satin White 20L', 45, 18.2],
], 'USD', 1350.055103);

console.log('Seeded invoices.');

// ---- seed HR: staff, salary advances, leave ----
const mkStaff = (name, email, phone, department, role, salary, bank, pensionRate, hmo, onboarding, nextOfKin, canLogin, password) => {
  db.prepare('INSERT INTO staff (user_id, name, email, phone, department, role, salary, bank, pension_rate, hmo_plan, onboarding, next_of_kin, can_login, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, name, email, phone, department, role, salary, bank, pensionRate, hmo, onboarding, nextOfKin, canLogin, password ? bcrypt.hashSync(password, 10) : null);
};

mkStaff('Adaeze Nwosu', 'adaeze@besconpaints.com', '08061112233', 'sales', 'Sales Lead', 320000, 'GTBank · 0123456789', 8, 'Hygeia Silver', 'active', 'Chidi Nwosu · 08051112233', 1, 'staff-demo');
mkStaff('Tunde Bakare', 'tunde@besconpaints.com', '08072223344', 'sales', 'Field Sales Rep', 210000, 'Access Bank · 0987654321', 8, 'Hygeia Silver', 'orientation', 'Folake Bakare · 08062223344', 0, null);
mkStaff('Funmi Adeyemi', 'funmi@besconpaints.com', '08083334455', 'support', 'Support Lead', 250000, 'Zenith Bank · 0111222333', 8, 'AXA Mansard Basic', 'active', 'Segun Adeyemi · 08073334455', 0, null);
mkStaff('Ibrahim Musa', 'ibrahim@besconpaints.com', '08094445566', 'inventory', 'Store Manager', 230000, 'First Bank · 0222333444', 8, 'AXA Mansard Basic', 'active', 'Aisha Musa · 08084445566', 0, null);
mkStaff('Ngozi Okafor', 'ngozi@besconpaints.com', '08105556677', 'hr', 'HR Officer', 280000, 'UBA · 0333444555', 8, 'Hygeia Gold', 'documents', 'Emeka Okafor · 08095556677', 0, null);
mkStaff('Yemi Alade', 'yemi@besconpaints.com', '08116667788', 'account', 'Accountant', 300000, 'Stanbic · 0444555666', 8, 'Hygeia Gold', 'invited', 'Bisi Alade · 08107778899', 0, null);

const st = (email) => db.prepare('SELECT id FROM staff WHERE email = ?').get(email).id;
db.prepare('INSERT INTO salary_advances (user_id, staff_id, amount, reason, status) VALUES (?, ?, ?, ?, ?)').run(uid, st('tunde@besconpaints.com'), 60000, 'School fees', 'pending');
db.prepare('INSERT INTO salary_advances (user_id, staff_id, amount, reason, status) VALUES (?, ?, ?, ?, ?)').run(uid, st('funmi@besconpaints.com'), 45000, 'Medical', 'approved');
db.prepare('INSERT INTO salary_advances (user_id, staff_id, amount, reason, status) VALUES (?, ?, ?, ?, ?)').run(uid, st('adaeze@besconpaints.com'), 80000, 'Family emergency', 'repaid');
db.prepare('INSERT INTO leaves (user_id, staff_id, type, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)').run(uid, st('funmi@besconpaints.com'), 'annual', '2026-12-05', '2026-12-12', 'pending');
db.prepare('INSERT INTO leaves (user_id, staff_id, type, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)').run(uid, st('ibrahim@besconpaints.com'), 'sick', '2026-11-18', '2026-11-19', 'approved');

console.log('Seeded HR module (staff, advances, leave).');

// ---- seed a paid payroll run (2026-10) with payslips + statutory remittances + roster ----
const payeMonthlySeed = (gross) => {
  const annual = gross * 12;
  const pensionAnnual = annual * 0.08;
  const cra = 200000 + annual * 0.20;
  const taxable = Math.max(0, annual - pensionAnnual - cra);
  const bands = [[300000, 0.07], [300000, 0.11], [500000, 0.15], [500000, 0.19], [1600000, 0.21], [Infinity, 0.24]];
  let tax = 0, rest = taxable;
  for (const [cap, rate] of bands) { if (rest <= 0) break; const slice = Math.min(rest, cap); tax += slice * rate; rest -= slice; }
  return Math.round(tax / 12);
};
const activeStaff = db.prepare("SELECT * FROM staff WHERE user_id = ? AND status = 'active'").all(uid);
let g = 0, pn = 0, pe = 0, nt = 0;
const runInfo = db.prepare("INSERT INTO payroll_runs (user_id, period, status) VALUES (?, '2026-10', 'paid')").run(uid);
for (const s of activeStaff) {
  const gross = s.salary, pension = Math.round(gross * 0.08), paye = payeMonthlySeed(gross);
  const net = gross - pension - paye;
  db.prepare('INSERT INTO payslips (user_id, run_id, staff_id, gross, pension, paye, net, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, runInfo.lastInsertRowid, s.id, gross, pension, paye, net, 'paid');
  g += gross; pn += pension; pe += paye; nt += net;
}
db.prepare('UPDATE payroll_runs SET total_gross = ?, total_pension = ?, total_paye = ?, total_net = ? WHERE id = ?').run(g, pn, pe, nt, runInfo.lastInsertRowid);
db.prepare("INSERT INTO remittances (user_id, period, type, amount, due_date, status, run_id) VALUES (?, '2026-10', 'paye', ?, '2026-11-10', 'paid', ?)").run(uid, pe, runInfo.lastInsertRowid);
db.prepare("INSERT INTO remittances (user_id, period, type, amount, due_date, status, run_id) VALUES (?, '2026-10', 'pension', ?, '2026-11-14', 'paid', ?)").run(uid, pn + Math.round(g * 0.10), runInfo.lastInsertRowid);

const today = new Date();
const fmtDay = (d) => d.toISOString().slice(0, 10);
const shiftsSeed = [['adaeze@besconpaints.com', 'morning'], ['tunde@besconpaints.com', 'morning'], ['funmi@besconpaints.com', 'afternoon'], ['ibrahim@besconpaints.com', 'morning'], ['ngozi@besconpaints.com', 'morning'], ['yemi@besconpaints.com', 'morning']];
for (let i = 0; i < 3; i++) {
  const day = new Date(today.getTime() + i * 864e5);
  for (const [email, shift] of shiftsSeed) {
    db.prepare('INSERT INTO shifts (user_id, staff_id, date, shift) VALUES (?, ?, ?, ?) ON CONFLICT(staff_id, date) DO NOTHING')
      .run(uid, st(email), fmtDay(day), i === 2 && email === 'funmi@besconpaints.com' ? 'off' : shift);
  }
}

console.log('Seeded payroll run, remittances and roster.');
