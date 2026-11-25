# OmniCRM — The All-in-One Smart CRM for Every Business

**Product Blueprint v0.2** · AI-powered, affordable digitalization for nano, micro, small, medium and enterprise businesses · Prepared for Grant Ojijieme · Updated 25 Nov 2026 (v0.1 → v0.2: pricing relaunch, built-feature inventory, tier system, Zuri AI, platform console)

---

## 1. The One-Liner

One affordable platform that gives every Nigerian business — from a one-person shop to a multi-branch enterprise — the same customer intelligence, sales power and operational automation that only large organizations can afford today, with AI doing the heavy lifting and WhatsApp as the front door.

## 2. The Problem (and Why Now)

Nigeria has ~39 million MSMEs (the engine of the economy), yet most run on paper, spreadsheets and WhatsApp chats. Customer data dies in phone memories; follow-ups are forgotten; nobody can say exactly what they sold last month.

Global CRMs are built for the top of the market: HubSpot starts at $15/seat/month and climbs to $75+; Salesforce is priced and configured for enterprises with admin teams. In naira terms, and in complexity terms, these are out of reach of a Lagos retailer or a Kano wholesaler.

Spreadsheets cannot keep up: Zapier's research found 68% of sales teams spend 3–10 hours every week on CRM administration, and 92% drop at least one qualified lead per month. Small businesses feel this pain most because they have no team to absorb it.

AI has changed the economics: tasks that used to need analysts — lead scoring, follow-up drafting, sales forecasting, report writing — can now be automated at near-zero marginal cost. Whoever brings that power down-market first wins the MSME segment.

## 3. Target Segments

| Segment | Who they are | Core need | Plan |
|---|---|---|---|
| Nano (1 person) | Side hustles, artisans, POS agents, freelancers | Track customers and debts; look professional | Start |
| Micro (2–5 staff) | Shops, salons, bakeries, small service firms | Invoicing, inventory, follow-ups | Start / Grow |
| Small (6–50 staff) | Retailers, clinics, schools, agencies, FM firms | Pipeline, team targets, AI copilot, reports | Grow |
| Medium (50–200) | Manufacturers, distributors, property firms | Multi-branch, integrations, permissions | Scale |
| Enterprise | Corporates, franchises, institutions | Custom objects, SSO, SLA | Enterprise (roadmap) |

## 4. The Product — What Is LIVE Today (Built & Verified)

Every module is optional and tier-gated — a nano business uses 10% of the product and an enterprise uses 100%. Same codebase, same beautiful interface.

### 1. CRM Core
Contacts, deals (kanban pipeline), tasks, quotes, activity timeline, duplicates merge. Per-dept access control — staff only see what concerns them.

### 2. Sales & Outreach
Follow-up engine with Zuri-drafted nudges (human approves before send), custom-order pricing flow (rep proposes → leadership approves → accounts raises the invoice), commission tracking, sales-rep invoice visibility rules.

### 3. Unified Multi-Channel Inbox (flagship)
WhatsApp, Instagram DMs, Facebook Messenger, TikTok DMs and Email in ONE inbox. One thread per customer, unread badges per channel, per-channel connect screens, inbound webhooks staged for Meta/TikTok (live once business verification lands). Real-time 6-second polling.

### 4. Support Desk (multi-agent, real time)
Multiple support staff log in simultaneously and split enquiries: claim/release with collision protection (double-claim blocked), assignee visibility ("with Funmi"), auto-claim on reply, bulk read on open.

### 5. Ops / Digitalization
Invoicing with payment links and receivables, FX conversion for foreign invoices (NGN/USD/EUR/GBP, 1.5% fee), sales orders with delivery confirmation, self-updating inventory (stock in, movements ledger, auto-deduction on delivery or payment, daily/weekly/monthly/quarterly/biannual/year digests), expenses with categories and date-range reports (up to 12 months), in-app wallet (virtual balance + ledger; real money moves via Paystack/Flutterwave payouts), staff shifts and commissions.

### 6. HR Suite
Staff onboarding, payroll runs, salary advances, pension (8% staff / 10% employer), HMO plans, leave, attendance clock-in/out, payslips, department assignment.

### 7. Zuri AI (the CRM's assistant)
- Hero-page chat widget: answers pricing, features, demo booking 24/7; quick chips; lead capture.
- Human handoff bridge: visitor's name + number lands as a real inbox thread in the CRM; staff replies flow back into the visitor's chat.
- In-app: follow-up drafts, WhatsApp reply drafts, activity reports, inventory digests.
- Fully logged (zuri_logs); rule-based today with automatic LLM upgrade when an API key is configured; human-approval gate on all outgoing AI drafts.

### 8. Insights
Dashboards with KPIs, sales/cash/conversion reports, per-department AI activity reports, inventory updates icon (company-wide), notification bell with deep links.

### 9. Platform Console (super admin)
Dedicated super-admin login: all organizations, one-click impersonation with "Return to Platform" banner, password resets, per-org granular feature toggles (13 switches), demo-link management (platform-only), full audit trail, platform KPIs. Live accounts sheet (Google) auto-syncs every new staff login and signup (15-min cron).

### 10. Experience
Dark mode (semantic tokens), mobile drawer navigation, time-aware greeting, premium landing page with tiered pricing, guest demo mode (read-only), accounts ledger in the repo and Drive.

## 5. Pricing (Live — relaunched 26 Nov)

Monthly + yearly (billed yearly, 9% discount). From ₦13,999/month.

| Tier | Monthly | Yearly (billed yearly) | Staff | Contacts | Inbox channels | Includes |
|---|---|---|---|---|---|---|
| Start | ₦13,999 | ₦152,869/yr | up to 3 | 500 | WhatsApp | Contacts, deals & pipeline, WhatsApp inbox, invoicing & payment links, follow-ups, community support |
| Grow | ₦27,999 | ₦305,749/yr | up to 10 | 5,000 | All 5 channels | Everything in Start + Instagram/Messenger/TikTok/Email inbox, Zuri AI drafts, inventory, expenses, wallet, team chat |
| Scale | ₦48,999 | ₦535,069/yr | unlimited | unlimited | All 5 channels | Everything in Grow + HR & payroll, Ads Studio (roadmap), priority support |

Enforced in-app: tier limits block contacts/staff beyond the cap with an upgrade message; non-included channels return 403 with the upgrade path; each org's Account section shows its plan, caps and usage.

*Superseded v0.1 pricing (₦0 / ₦2,500 / ₦7,500 / ₦25,000) is retired.*

Monetization extras: transaction fee on invoice payments collected in-app (~1%), storefront sales commission, WhatsApp API message bundles, Ads Studio fee (% of ad spend, default 10%), partner/agency resale program.

## 6. The AI Layer — Where "Smart" Lives

Live today (rule-based, LLM-ready): follow-up engine, WhatsApp reply drafts, activity reports, inventory digests, Zuri hero bot + handoff.

Roadmap: Speak-to-CRM (voice/typed sale entry), lead scoring, forecasting, ask-your-data in plain language, invoice chaser (escalating reminders), Monday 8am WhatsApp owner's digest.

## 7. Positioning vs the Giants

We do not fight on features with the giants — we fight on access. The 39m MSMEs that can't afford or understand them are the market.

- WhatsApp-native: yes (giants: partial or no)
- AI for nano-users: free tier gets the copilot too (giants: enterprise only)
- Naira-native pricing: yes (giants: dollar)
- Zero-training: chat-first, 3 clicks to anything

## 8. UX Principles — "Super Intuitive" Is a Feature

- Chat-first: the core interface looks like WhatsApp — the only interface the market already knows.
- Three-click rule: any task reachable in ≤3 taps.
- Mobile-first PWA: works on a budget Android phone on 3G.
- Zero jargon: "Customer Book", "Money In/Out", "Who to Call Today".
- One beautiful design system; dark mode for low-light shops.
- Guided first run: 90-second onboarding.

## 9. Technology & Build Approach

- **Live implementation:** React (Vite PWA) frontend · Node.js (Fastify) API · SQLite (single-file, per-tenant data) · JWT auth with department claims · bcrypt passwords · Cloudflare tunnel for public demo.
- **Production target:** PostgreSQL with multi-tenant isolation + per-tenant encryption keys; Capacitor wrappers for app stores; permanent domain.
- **AI:** LLM APIs (DeepSeek/Groq cost floor, GPT-4o-mini balance, Gemini Flash multilingual) via a server-only key — never in the browser; strict guardrails; AI never sends without human approval; per-org daily caps and full AI audit trail.
- **Payments:** Paystack/Flutterwave for in-app invoice collection (demo-pay fallback live today).
- **WhatsApp:** Cloud API endpoints staged; BSP (360dialog-style) for broadcast at launch.

## 10. Go-to-Market & Roadmap

- **DONE:** CRM core, multi-channel inbox, support desk, invoicing, orders, inventory, wallet, expenses, HR, Zuri, platform console, tier system, dark mode, accounts sheet sync.
- **M4 (Ads Studio Phase A):** campaign wizard, budget + % fee engine, Meta Ads connect, basic analytics, Paystack billing.
- **M5 (Phase B–C):** Google Ads, ROI matching to CRM sales, WhatsApp ad reports, AI optimisation, iOS/Android wrappers.
- **Also ahead:** Speak-to-CRM, broadcast with templates, mini storefront, lead scoring, forecasting, ask-your-data, email auto-send (SMTP), permanent domain, business verification for live Meta/TikTok channels.

## 11. Risks & Mitigations

- Adoption fear → free trial, WhatsApp-native UX, agent-assisted onboarding in local languages.
- WhatsApp API cost per message → bundle pricing; SMS/USSD fallback for critical alerts.
- Data/privacy → local hosting option, transparent data policy, no data selling.
- Competition (Zoho, Bitrix, local startups) → out-price, out-UX, out-distribute through agent/reseller networks and business communities.
- AI hallucination in customer-facing messages → human-approval gate on ALL outgoing messages; no exceptions.
- Real PII in demo seed → anonymized; further PII-gating before LLM goes live on real data.

## 12. Immediate Next Steps

- Business verification for Meta + TikTok so live messages flow into the unified inbox.
- Paystack secret key for real in-app payments (demo-pay live today).
- LLM API key (DeepSeek/Groq) to switch Zuri and the copilot from rules to full intelligence.
- SMTP/IMAP credentials for the email channel.
- Permanent domain + Capacitor app wrappers.
- Sign the first 20 design-partner businesses from Bescon and church networks.

*Sources informing the blueprint: sage.com CRM (Nigeria), zoho.com/crm, hubspot.com/products/crm, zapier.com CRM research, salesforce.com/crm, respond.io (inbox + pricing benchmark).*
