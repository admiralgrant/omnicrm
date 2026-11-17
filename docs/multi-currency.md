# Multi-Currency Invoicing & Payments

> Owner question: international payments sometimes must be in foreign currency. Can the
> CRM stay naira but convert anything that limits, so there's no hitch using the product?
> Answer: yes — naira-native books + foreign-currency invoices + live FX conversion +
> Paystack's FX rails.

## 1. Model

- **Books are always naira.** Dashboard, debts, receivables, taxes — everything the
  business owner sees aggregates in ₦. No mental conversion ever.
- **Invoices can be priced in NGN, USD, EUR or GBP.** The invoice stores three numbers:
  `total` (in the customer's currency), `fx_rate` (rate at creation), and `ngn_total`
  (the naira equivalent frozen at creation — the books never move afterwards).
- **Rates are live, with a fallback.** Fetched from open.er-api.com (updates daily,
  free, no key), cached 10 minutes server-side. If the provider is unreachable, a
  hardcoded fallback table keeps invoicing working (labelled `offline rate` in the UI).
- **Payment rails:** naira invoices settle NGN on Paystack; foreign-currency invoices
  are converted to USD at the current rate and settled in USD — Paystack handles the
  card-scheme FX, and the business receives naira (Paystack NGN settlement) or USD
  (Paystack USD settlement) depending on account setup.

## 2. What the user sees

- New Invoice: currency selector; picking USD/EUR/GBP shows "1 USD ≈ ₦1,350.06 · live
  rate — books stay in naira automatically".
- Invoice list: foreign invoices show `$187 ≈ ₦252,460` side by side.
- Invoice detail + public pay page: totals in the customer's currency plus the naira
  equivalent line with the frozen rate.
- WhatsApp share message: amounts in the customer's currency with the ≈ ₦ equivalent.

## 3. API

- `GET /fx` → `{ base: 'NGN', rates: {USD,EUR,GBP} per naira, source: live|fallback }`
- `POST /invoices` accepts `currency` (default NGN); validates against the supported
  set; freezes `fx_rate` + `ngn_total`.
- `/invoices` list: `receivables` summed in naira (`ngn_total`).
- `/pay/:token/initialize`: NGN invoices → Paystack NGN (kobo); foreign → Paystack USD
  (cents), converted at the current USD rate. Metadata carries `invoice_currency`.
- Paying an invoice (demo or webhook) reduces the contact's naira debt by `ngn_total`.

## 4. Honest limitations

- The frozen `fx_rate` is the *invoice* rate (CBN-interbank-sourced). What the
  customer's card charges them is the card scheme's own rate on the day — usually
  within 1–3%. The invoice is always payable at exactly the naira equivalent shown;
  we recommend adding a note for customers when the gap matters on large amounts.
- EUR/GBP invoices settle via USD conversion (Paystack doesn't take EUR directly),
  which adds one more hop; the UI shows the naira equivalent so the business is never
  surprised.
- ZAR, GHS, KES and others can be added by extending `FX_CURRENCIES` + the rate map —
  Paystack natively supports GHS/ZAR/KES when we're ready.
