# Home (Landing) Page + Department Dashboards

> Owner note (17 Nov): the home page must be a WELCOME page that introduces the product
> and its features, then categories and pricing and other necessary elements. The logged-in
> experience starts at a realtime DASHBOARD showing different units/departments:
> sales, customer support, inventory, product, etc.

## 1. Public home (no login)

Sections, top to bottom:
- **Hero** — product name + one-line promise + "Start free" / "Log in" actions.
- **Features** — the modules as benefit cards: Sales CRM, WhatsApp AI Inbox, Inventory,
  Invoicing, Ads Studio, Support Desk.
- **Who it's for (categories)** — nano / micro / small / medium / enterprise, each with a
  one-line fit ("corner shop → bank-grade tools at naira prices").
- **Pricing** — Starter (free), Growth (₦9,900/mo), Pro (₦24,900/mo), Enterprise (custom).
  Note the Ads Studio model: fee = % of ad spend, no fixed charge.
- **Footer** — contact, trust line, copyright.

Logged-out users see ONLY this page; "Log in" opens the existing auth card.

## 2. Dashboard (after login) — department switcher

The dashboard is the realtime home of the CRM, split by unit. A pill-switcher at the top:

- **Sales** — pipeline value, open deals, follow-ups due, recent activity, quick links to
  Customers and Inbox. (Backed by existing KPIs + activities.)
- **Support** — open tickets, SLA breaches, inbox unread, quick links. (New `tickets` table.)
- **Inventory** — stock levels, low-stock alerts, stock value. (New `products` table.)
- **Product** — catalog with prices and margin. (Same table, product view.)

Every panel reads live from the API (no static numbers), so new data updates it in real time.

## 3. Data model additions

- `products(id, user_id, name, sku, stock, low_stock_at, unit_cost, unit_price, category)`
- `tickets(id, user_id, contact_id, subject, status open|pending|closed, priority, created_at)`

## 4. API additions

- `GET /products` — catalog + computed low-stock flag and total stock value
- `GET /tickets` — open/pending/closed counts + list
- `GET /dashboard` — extended with support/inventory summary (kept in one call for speed)

## 5. Navigation after login

Sidebar (desktop) / bottom bar (mobile):
Dashboard, Customers, Inbox, Follow-ups, Ads Studio.

"Home" no longer exists inside the app — the public landing page owns that name.
