# Revenue Streams (OmniCRM monetisation)

> Owner note: fees on conversions and other services are the revenue path. Every stream
> below is either shipped or specced; fees are always visible on the document, never hidden.

## 1. Conversion processing fee (SHIPPED)

- Foreign-currency invoices (USD/EUR/GBP) carry a **1.5% processing fee** on the invoice
  total (configurable via `FX_FEE_RATE` env).
- Shown as a line item everywhere: invoice detail, public pay page, PDF, WhatsApp share,
  email draft — "Processing fee (1.5%)".
- Naira invoices carry no fee. The fee is charged in the invoice currency and included
  in `ngn_total` (the books), so revenue and receivable are both correct.

## 2. Ads Studio fee (SPECKED — module not built)

- % of ad spend (default 10%) collected with the budget via Paystack. No fixed fee.

## 3. Subscription tiers (SHIPPED on the landing page)

- Starter ₦0 · Growth ₦9,900/mo · Pro ₦24,900/mo · Enterprise custom.

## 4. Payment-rail pass-through (planned)

- When Paystack goes live, the ~1.5% card fee passes through to the merchant (Paystack's
  own pricing) — plus our optional payment-processing markup for Growth-plan businesses.

## 5. Bundles & commissions (planned)

- WhatsApp Cloud API message bundles.
- Storefront sales commission (module not built).
- Partner/agency resale program (blueprint extras).

## Fee display rules (all channels)

- PDF: fee row above the total.
- Web list/detail: fee row + total includes it.
- WhatsApp message: "(incl. 7.5% VAT + processing fee)" with the fee amount.
- Email draft: fee line before the total.
- Pay page: fee row before the total, button charges total + fee.
