# 📖 Book of Remembrance — OmniCRM

The running record of everything we discuss, deliberate, and build.
**Rule: nothing is ever deleted.** When an item is done, it is struck through (~~like this~~) with a note of what was actually shipped. If it was tweaked, the tweak is recorded — never silently removed.

Say **"book of remembrance"** and I pull this up.

---

## ✅ DONE (struck through = shipped)

- ~~Commissions calculator — sales staff + HR visibility, on the payslip~~ → built: `/commissions`, HR tab + portal, flows into payroll runs + payslip PDF.
- ~~Invoice PDF download + email path + password visibility toggle~~ → built.
- ~~Conversion processing fee (1.5% on foreign-currency invoices)~~ → built, revenue stream.
- ~~Multi-currency invoicing (NGN/USD/EUR/GBP, live FX)~~ → built.
- ~~Demo links (revocable, guest read-only, hero entry)~~ → built + hardened (session-scoped, no-cache, admin login blocked on demo links).
- ~~Mobile nav / hero / logout~~ → built.
- ~~HR module (staff, onboarding, salaries, advances, pension, HMO, leave, payroll, payslips)~~ → built.
- ~~Statutory remittance calendar + payroll journal export + shift roster~~ → built.
- ~~Ads Studio spec~~ → documented in `docs/ads-module.md`; NOT yet built (feasibility confirmed).
- ~~Order workflow (raise → approve → invoice → deliver → payment, rep-scoped)~~ → built.
- ~~Invoice creation locked to admin/accounts (reps raise orders instead)~~ → built.
- ~~In-Mail team chat (threads)~~ → replaced by modern chat (below).
- ~~Modern chat: DMs + channels + @mentions (person & team)~~ → built.
- ~~Departmental channels (#Sales #Support #Inventory #HR #Account) + CEO/HR oversight~~ → built.
- ~~Duplicate DM conversations~~ → fixed (canonical member ordering + dedupe migration).
- ~~Stationary stock feed + payment receipt upload (photo) + matching~~ → built (moved out of In-Mail).
- ~~Actionable notifications (tap → chat/orders/invoices/inventory) + close button~~ → built.
- ~~Form field labels (product, customer, order) + mobile wrap~~ → built.
- ~~Order form: product dropdown (catalog), custom-order toggle, payment terms, notes~~ → built.
- ~~"Remove" button (replaced ambiguous ✕)~~ → built.
- ~~Staff login enabled for all demo staff (yemi etc.)~~ → fixed.
- ~~"+ New" chat flow (New chat / New channel) + WhatsApp-style contact list~~ → built.

## ⏳ STILL OPEN (discussed, not yet built)

- **Real WhatsApp inbox** — needs Meta business verification + WABA + token. Currently stores/simulates messages. *(blocked on user's Meta verification)*
- **Multiple WhatsApp numbers + shared support number with "who replied" tags** — confirmed feasible; NOT built (needs live API first).
- **Shared-inbox features**: assign chat to a teammate, "who's typing" — noted for later.
- **Ads Studio full build** — guided setup, copy/creative gen, Meta+Google API launch, ROAS analytics, %-of-spend fee. *(feasible; spec exists, not built)*
- **Payment receipt image upload** — DONE for photos, but name-picker for @mentions etc.
- **Sales rep invoice visibility** — ~~question raised, not decided~~ → **DECIDED + BUILT (23 Nov):** plain sales reps see ONLY their own customers' invoices and only after delivery (status sent/paid/overdue); draft invoices hidden; department leads (role contains Lead/Head/Manager), admin, HR and CEO see ALL invoices. Enforced server-side on list + single fetch. Verified: Tunde sees 2 (own only), Adaeze/Yemi/Ngozi see 15, cross-customer fetch 403.
- **Live demo DB anonymization** — ~~flagged~~ → **DONE (23 Nov):** live seed contacts renamed to fictional companies (Zoria Access, Bescon Global Development, Jacoco Beverage, Prime Care, Summit Crest, Lekki Crown, Heritage Gate) with fake phones/emails; deal titles updated. NOTE: one user-added contact ("Bookshop", real gmail) was left untouched, it is your own entry, say the word to scrub it too.
- **Time-aware greeting** — **BUILT (23 Nov):** dashboard greeting uses the local clock: Good morning (before 12), Good afternoon (12-17), Good evening (after 17).
- **Dark mode** — **BUILT (23 Nov):** moon/sun toggle in the topbar AND on the hero/landing nav, persisted per device; full dark palette via CSS variables. FIXED: circular CSS variables in :root (self-referencing tokens broke soft colors) and a body transition that stalled theme flips (body stayed light while cards went dark, the "didn't align well" report). Verified: body/cards/landing all flip together. Note: /pay.html payment page still light (future pass).
- **Premium UI/UX pass** — **BUILT (23 Nov):** blurred translucent landing nav, hover-lift on feature/price cards, focus rings on inputs, button press feedback, tabular KPI numerals, tighter heading tracking, gradient logo glow, consistent transitions.
- **Super-admin platform (dedicated console + logins)** — **BUILT (23 Nov):** separate super-admin account superadmin@omnicrm.com (platform_only) logs into a full-screen Platform Console: KPIs (orgs, staff, contacts, paid invoice value, wallet totals, AI calls), org table with Enter org (impersonate), Reset password, per-org feature toggles, and the audit trail. Regular admins: grant@omnicrm.com (Bescon owner) + three seeded tenants with own logins: zoria@omnicrm.com, besconglobal@omnicrm.com, jacoco@omnicrm.com. Org admins are blocked from /platform/* (403). Verified: impersonation, summary, 403s.
- **Live accounts sheet** — **BUILT (23 Nov):** Google Sheet "OmniCRM Accounts & Logins" (in Admirals folder, id 1U6I51McNhmCjfA5lkcUaoT01hXdQ4INwKTMZlN2oPcw) tracks every account (role, email, password, org, scope, status, last updated). Convention: update the sheet whenever accounts are added/changed as we build. Mirror in docs/accounts.md.
- **Super admin "Return to Platform" switch** — ~~NEW, not built~~ → **BUILT (23 Nov):** impersonated sessions (JWT imp_by) show a banner in the org app with "Return to Platform Console"; POST /platform/exit verifies the imp_by admin, issues a fresh platform token, audit-logs the return. Verified: enter org → banner → one tap back to console; non-impersonated exit → 400.
- **Demo links move to super admin only** — ~~NEW, not built~~ → **BUILT (23 Nov):** org-level /demo-links endpoints now 403 for everyone but platform admins; org Account card reduced to a notice. Platform Console gains a Demo links card: pick any org + label, create (URL prompt), copy, revoke; all actions audit-logged. Verified: zoria POST/GET 403, platform create/list/revoke 200, audit trail records all four actions.
- **Custom-order pricing** — ~~question raised, not locked~~ → **DECIDED:** rep proposes; CEO/admin (or head of dept) approves the discount/custom price; the approved number becomes the invoice. Reps can propose discounts but never set final price. Two legs: sales proposes → leadership approves → accounts raises invoice with approved price.
- **Support/HR channels** — keep fully private, or allow view-only from other depts? *(decided: private for now)*
- **Real-time chat delivery** — ~~not auto-push~~ → **BUILT:** 8s polling with unread badges; true websockets remain a future upgrade.
- **Unread badges on chat sidebar** — ~~noted~~ → **BUILT** (nav + per-conversation).
- **Inventory auto-tracking (AI stock module)** — ~~planned~~ → **BUILT:** stock_movements ledger (in/out/adjustment/opening); stock deducts automatically at delivery confirmation (order flow) or invoice-paid (standalone); Stock-in form + movements ledger UI; AI inventory digest (daily/weekly/monthly/quarterly/biannual/year) pushed 8am Lagos to inventory+sales+support staff and CEO; AI report gains biannual+year periods; payment now requires delivery first. Verified E2E (Ibrahim stock-in +20 → Adaeze order → Yemi deliver → stock −3, digest "+336 in / −3 out" landed for all 5 audiences).
- **Inventory digest separation (SPEC LOCKED)** — ~~not built~~ → **BUILT:** (1) Inventory dept section keeps ALL features; (2) archive "Inventory Updates" icon in top bar beside bell, visible to EVERYONE, identical company-wide view; own unread badge; (3) digests removed from the general bell; (4) inventory removed from the general AI Activity Report (scopes now sales/support/account); (5) deep-links into the AI Digest tab with the right period. Verified all departments receive the same digests.
- **Wallet** — ~~NEW, not built~~ → **BUILT v1:** org wallet (virtual balance + in/out ledger); invoice/order payments auto-credit; top-up + payout (balance-guarded; demo mode processes instantly, live mode marks 'requested' for Paystack transfer); Wallet view with transactions; staff blocked from moving money. Verified: payment ₦107,500 credited, insufficient payout blocked, sales 403.
- **Copy style rule** — **BUILT:** every "—" (em dash) removed from website copy (53 replaced) in App.jsx and notification texts.
- **Icon style rule** — **BUILT:** 45-icon Lucide-style SVG Icon component; nav, dept pills, topbar (bell + archive), section headers, buttons, avatars, notification icons, hero feature tiles all use premium SVG icons.
- **Mobile navigation** — **BUILT:** no bottom bars; hamburger opens a slide-in drawer with every destination; backdrop dismiss; notch-safe; same items as desktop sidebar. Verified all 11 destinations render.
- **Chat real-time + unread badges** — **BUILT:** 8s polling of /chat/unread with per-conversation unseen counts; In-Mail nav badge + per-conversation badges; open conversation auto-refreshes and marks seen (watermarks in localStorage).
- **Super-admin console** — **BUILT:** /platform/orgs, impersonate (2h token + audit), password reset, per-org feature toggles, audit trail; visible in Account for the platform admin (grant@ set is_platform=1). Verified impersonation + audit + 403 for staff.
- **LLM scaffold** — **BUILT:** askLLM module (env LLM_API_KEY/URL/MODEL, DeepSeek default), 100-calls/day per-org cap, rule-based fallback; /ai/draft uses LLM when key present, audits every generation (ai_audit table, source rules|llm). Decision A/B still pending: A (vendor key) is the default once a key is added.
- **Email auto-send** — **BUILT:** SMTP scaffold (nodemailer, env-configured); invoice send auto-emails the pay link when SMTP_HOST set, returns {sent:false, reason} otherwise; manual mailto stays the fallback.
- **AI ethics recommendations** — **PARTLY BUILT:** seed data anonymized for fresh installs (Zoria/Bescon Global/Jacoco, fake phones); Privacy & AI Disclosure page live (/privacy.html, NDPA-aware, linked in footer); AI audit trail built. PENDING: consent line in WhatsApp flows, provider DPA, bias review, Ads guardrails (all need live integrations). NOTE: the LIVE demo DB still holds the real FMPP contact data you entered; I did NOT wipe it without your say-so. Recommend a separate demo org for public links.
- **Unread badges on chat sidebar** — noted.
- **LLM connection process (recorded 20 Nov)** — key lives ONLY on the server (.env), never in the app; pick provider (DeepSeek/Groq cheapest, GPT-4o-mini best balance, Gemini Flash multilingual); add `askLLM(prompt, context)` module that the three `/ai/*` endpoints call with rule-based fallback; meter per-org daily caps (pricing already promises 5 AI follow-ups/day on Starter); ~1 day of work. DECISION PENDING: (A) vendor pays one key, AI baked into tiers [recommended start] vs (B) BYOK per-org keys encrypted at rest.
- **AI ethical compliance self-rating (20 Nov): ~70/100** — rubric: privacy 16/25 (no LLM data egress yet, but REAL PII in seed data — Alpha Mead/GPFI/Knight Frank real phones/emails — must anonymize before public demo links), human oversight 18/20 (approve-to-send everywhere), transparency 9/15 (drafts labeled, but no customer-facing AI policy/consent), security 13/15 (RBAC/403/scoping, keyless), fairness 7/10 (deterministic now, no bias testing plan), accountability 5/10 (no AI audit trail), governance 2/5 (owner asks right questions, nothing documented). Gap list to fix before LLM: privacy policy + AI disclosure, WhatsApp data consent, provider DPA, anonymize seed data, AI audit trail. NOTE: plugging an LLM in WITHOUT these would LOWER the score (new egress surface); building policy layer first raises it to ~85-90.
- **RECOMMENDATIONS (priority order, from the ethics review)**: (1) URGENT — anonymize seed data before any public demo (fake names/numbers for Alpha Mead, GPFI, Knight Frank, Eko Maintenance etc. — NDPR exposure); (2) write Privacy Policy + AI Usage Disclosure page (drafts are AI-assisted, human-approved; data storage; WhatsApp content handling); (3) decide LLM key model A vs B before building; (4) when LLM lands: sign provider DPA, add per-org daily AI caps, never log raw prompts containing customer data; (5) build AI audit trail (store AI-generated draft + human-edited final + approver, visible in activity log); (6) consent line in WhatsApp auto-replies where AI drafts are used; (7) bias/tone review of LLM outputs in Naija context (Yoruba/Pidgin) before rollout; (8) Ads Studio guardrails must include hard budget caps + kill switch before any live ad spend. Target: 85-90/100 before public launch.
- **Permanent domain** — replace trycloudflare tunnel with a real domain.
- **Capacitor mobile app packaging** — iOS/Android.
- **Gmail/SMTP auto-send for invoices & order-stage emails** — currently mailto draft + in-app notifs.

---

*Last updated: 19 Nov 2026. Nothing here is ever deleted — only struck through with a note when acted on.*
