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
- **Custom-order pricing** — does the rep's estimate become the invoice, or is price set by admin/accounts at approval? *(question raised, not locked)*
- **Support/HR channels** — keep fully private, or allow view-only from other depts? *(decided: private for now)*
- **Real-time chat delivery** — currently new messages show on refresh/click, not auto-push.
- **Unread badges on chat sidebar** — noted.
- **Permanent domain** — replace trycloudflare tunnel with a real domain.
- **Capacitor mobile app packaging** — iOS/Android.
- **Gmail/SMTP auto-send for invoices & order-stage emails** — currently mailto draft + in-app notifs.

---

*Last updated: 19 Nov 2026. Nothing here is ever deleted — only struck through with a note when acted on.*
