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
- **Sales rep invoice visibility** — should reps see only their own customers' invoices, only after delivery? *(question raised, not decided)*
- **Custom-order pricing** — ~~question raised, not locked~~ → **DECIDED:** rep proposes; CEO/admin (or head of dept) approves the discount/custom price; the approved number becomes the invoice. Reps can propose discounts but never set final price. Two legs: sales proposes → leadership approves → accounts raises invoice with approved price.
- **Support/HR channels** — keep fully private, or allow view-only from other depts? *(decided: private for now)*
- **Real-time chat delivery** — currently new messages show on refresh/click, not auto-push.
- **Inventory auto-tracking (AI stock module)** — ~~planned~~ → **BUILT:** stock_movements ledger (in/out/adjustment/opening); stock deducts automatically at delivery confirmation (order flow) or invoice-paid (standalone); Stock-in form + movements ledger UI; AI inventory digest (daily/weekly/monthly/quarterly/biannual/year) pushed 8am Lagos to inventory+sales+support staff and CEO; AI report gains biannual+year periods; payment now requires delivery first. Verified E2E (Ibrahim stock-in +20 → Adaeze order → Yemi deliver → stock −3, digest "+336 in / −3 out" landed for all 5 audiences).
- **Inventory digest separation (SPEC LOCKED, not built)** — (1) Inventory dept section keeps ALL features (Stock/Movements/Stock-in/AI Digest tab); (2) new 📦 "Inventory Updates" icon in top bar beside 🔔, visible to EVERYONE, identical company-wide view; own unread badge; (3) inventory digests removed from the general bell; (4) NEW: inventory removed from the general AI Activity Report — inventory reporting lives only in the inventory section + the 📦 icon; (5) general department report otherwise untouched.
- **Wallet (NEW, not built)** — user wants an in-app wallet from which money can be moved. Open design questions: whose wallet (org-level? per-staff?), what flows in (customer payments, FX fees, ad-spend top-ups?), how money moves out (bank payout, transfer between orgs/accounts), and Nigeria licensing reality: holding customer funds requires a payment license (Paystack/Flutterwave hold the money; a CRM "wallet" likely has to be a ledger/virtual balance + payout API, not real value custody).
- **Copy style rule (user directive, 23 Nov)** — REMOVE every trace of "—" (em dash) from all write-ups/copy within the website (hero page, landing, marketing copy). Use commas/sentences instead.
- **Icon style rule (user directive, 23 Nov)** — every icon must be changed to premium and matured ones: replace playful/casual emojis with a refined, professional icon set (e.g. Lucide/SVG-style icons) across the app UI.
- **Mobile navigation (DECIDED, 23 Nov)** — NO bottom bars on mobile. A ☰ hamburger button (top-left) opens a slide-in drawer sidebar (WhatsApp/Gmail-style) revealing EVERY destination: dashboard, all departments, orders, invoices, in-mail, and future modules (Inventory Updates, Wallet, Ads). Same drawer as desktop sidebar, backdrop dismiss, safe-area padding for notches, 44px+ touch targets. The current mobile "More" overflow gets replaced by this full drawer.
- **Unread badges on chat sidebar** — noted.
- **LLM connection process (recorded 20 Nov)** — key lives ONLY on the server (.env), never in the app; pick provider (DeepSeek/Groq cheapest, GPT-4o-mini best balance, Gemini Flash multilingual); add `askLLM(prompt, context)` module that the three `/ai/*` endpoints call with rule-based fallback; meter per-org daily caps (pricing already promises 5 AI follow-ups/day on Starter); ~1 day of work. DECISION PENDING: (A) vendor pays one key, AI baked into tiers [recommended start] vs (B) BYOK per-org keys encrypted at rest.
- **AI ethical compliance self-rating (20 Nov): ~70/100** — rubric: privacy 16/25 (no LLM data egress yet, but REAL PII in seed data — Alpha Mead/GPFI/Knight Frank real phones/emails — must anonymize before public demo links), human oversight 18/20 (approve-to-send everywhere), transparency 9/15 (drafts labeled, but no customer-facing AI policy/consent), security 13/15 (RBAC/403/scoping, keyless), fairness 7/10 (deterministic now, no bias testing plan), accountability 5/10 (no AI audit trail), governance 2/5 (owner asks right questions, nothing documented). Gap list to fix before LLM: privacy policy + AI disclosure, WhatsApp data consent, provider DPA, anonymize seed data, AI audit trail. NOTE: plugging an LLM in WITHOUT these would LOWER the score (new egress surface); building policy layer first raises it to ~85-90.
- **RECOMMENDATIONS (priority order, from the ethics review)**: (1) URGENT — anonymize seed data before any public demo (fake names/numbers for Alpha Mead, GPFI, Knight Frank, Eko Maintenance etc. — NDPR exposure); (2) write Privacy Policy + AI Usage Disclosure page (drafts are AI-assisted, human-approved; data storage; WhatsApp content handling); (3) decide LLM key model A vs B before building; (4) when LLM lands: sign provider DPA, add per-org daily AI caps, never log raw prompts containing customer data; (5) build AI audit trail (store AI-generated draft + human-edited final + approver, visible in activity log); (6) consent line in WhatsApp auto-replies where AI drafts are used; (7) bias/tone review of LLM outputs in Naija context (Yoruba/Pidgin) before rollout; (8) Ads Studio guardrails must include hard budget caps + kill switch before any live ad spend. Target: 85-90/100 before public launch.
- **Permanent domain** — replace trycloudflare tunnel with a real domain.
- **Capacitor mobile app packaging** — iOS/Android.
- **Gmail/SMTP auto-send for invoices & order-stage emails** — currently mailto draft + in-app notifs.

---

*Last updated: 19 Nov 2026. Nothing here is ever deleted — only struck through with a note when acted on.*
