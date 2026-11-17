# Invoicing Module

> Owner note: businesses must invoice from their phone, track payments, and chase
> debtors politely. The invoice must feed the CRM — every unpaid invoice becomes a
> follow-up, every payment updates the dashboard.

## 1. Flow

1. Sales → "New Invoice": pick customer, add line items (description, qty, price),
   set due date. Auto-numbered INV-YYYY-NNN.
2. Send (WhatsApp link / email in later phases) → status `sent`.
3. Customer pays → "Mark paid" (v0; Paystack webhook in later phase) → status `paid`,
   CRM dashboard debt drops.
4. Past due and unpaid → status `overdue` flag, appears in Follow-ups as a payment
   reminder draft.

## 2. Data model

- `invoices(id, user_id, contact_id, number, status draft|sent|paid|overdue,
  issue_date, due_date, subtotal, tax_rate, tax, total, created_at)`
- `invoice_items(id, invoice_id, description, qty, unit_price, amount)`
- Statuses derived on read: overdue = sent + due_date < today and not paid.

## 3. API

- `GET /invoices` — list + counts (draft/sent/paid/overdue) + receivables total
- `POST /invoices` — {contact_id, due_date, items[]} → creates with computed totals
- `GET /invoices/:id` — detail + items
- `POST /invoices/:id/send` — mark sent (logs activity, updates contact last_contacted)
- `POST /invoices/:id/paid` — mark paid (clears debt on contact if matching)

## 4. UX rules

- Currency naira, formatted with ₦ and thousand separators.
- Every list item shows: number, company, total, due date, status chip.
- Overdue rows get a red chip and appear in AI Follow-ups automatically.

## 5. Phasing

- Phase A (now): create/list/detail/send/mark-paid, seed data.
- Phase B: WhatsApp/email delivery with a pay link (Paystack), webhook auto-mark-paid,
  receipts (PDF).
- Phase C: recurring invoices, partial payments, credit notes, VAT breakdown.

## 6. Risks

- Tax/VAT display must be explicit (show rate and amount, never bake into price silently).
- Payment link expiry and idempotency when Paystack lands.
