# WhatsApp Inbox Module

> Owner note: the inbox must feel exactly like WhatsApp — it is the interface the
> market already knows. AI drafts messages in-thread; nothing sends without approval.

## 1. Vision

One unified business inbox inside OmniCRM that looks and behaves like WhatsApp:
threads with all customers, incoming and outgoing history, AI drafts for follow-ups
and payment reminders, and one tap to send. No switching between the CRM and the
phone's WhatsApp — the business conversation and the customer record are the same thing.

## 2. Flow

1. Owner opens Inbox → sees threads (latest message per contact, unread badge).
2. Opens a thread → full conversation history with that customer.
3. Taps "AI Draft" → the copilot writes the next message (follow-up, reminder,
   thank-you) based on the contact's status (proposal sent, owes money, deal won).
4. Owner edits or approves → message sends (v0: stored + marked sent; Cloud API send
   in Phase B) → thread updates instantly, activity logged on the contact.

## 3. Data model

- `messages(id, user_id, contact_id, direction IN|OUT, body, status DRAFT|SENT|FAILED, created_at)`
- Threads are derived: latest message per contact + unread count.
- Incoming messages in v0 come via the API; Phase B wires the WhatsApp Cloud API
  webhook so real inbound WhatsApp messages land here.

## 4. API

- `GET /inbox` — threads (contact, last message, time, unread count)
- `GET /messages?contact_id=N` — conversation history
- `POST /messages` — send/store message {contact_id, body} (direction OUT, status SENT)
- `POST /messages/:id/read` — mark read
- `GET /ai/draft?contact_id=N` — AI-drafted next message from contact state

## 5. AI drafting rules (v0, rule-based; LLM in later phase)

- owes money → polite payment reminder with amount
- proposal sent / follow-up due → follow-up nudge
- deal won → thank-you + next steps
- default → friendly check-in

## 6. Phasing

- Phase A (now): inbox UI, threads, history, AI drafts, send/store, seed data.
- Phase B: WhatsApp Cloud API (inbound webhook + real outbound send), read receipts,
  media messages, templates for broadcasts.
- Phase C: multi-agent inbox (assign conversations to staff), quick replies, labels.

## 7. Risks

- Cloud API requires Meta business verification — start the process early.
- Outbound message templates must comply with WhatsApp policy — the AI gate stays:
  never send without owner tap.
