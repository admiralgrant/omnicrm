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
