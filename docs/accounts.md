# OmniCRM — Accounts & Logins

Live mirror of the Google Sheet (in the Admirals folder on Drive): https://docs.google.com/spreadsheets/d/1U6I51McNhmCjfA5lkcUaoT01hXdQ4INwKTMZlN2oPcw
(The sheet is the source of truth; update both when adding accounts. Last updated 2026-11-27.)

## Super Admin (platform console, overhead controller)

| Role | Email | Password | Organization |
|---|---|---|---|
| SUPER ADMIN | superadmin@omnicrm.com | omnicrm-superadmin | OmniCRM Platform |

Full console: all orgs, enter any org (impersonate, 2h + audited), reset org passwords, per-org feature toggles, demo-link creation, audit trail, platform KPIs.

## Regular Admin (org owner = inbound admin)

| Role | Email | Password | Organization |
|---|---|---|---|
| Owner + inbound admin | grant@omnicrm.com | omnicrm-demo | Bescon Paints |

The owner receives every new signup instantly (in-app notification + Inbound card on the dashboard) and the accounts sheet syncs in real time.

## Staff (all share: staff-demo)

| Role | Email | Department | Notes |
|---|---|---|---|
| Sales Lead | adaeze@omnicrm.com | sales | sees all invoices (dept lead) |
| Field Sales Rep | tunde@omnicrm.com | sales | own customers' invoices after delivery only |
| Support Lead | funmi@omnicrm.com | support | |
| Store Manager | ibrahim@omnicrm.com | inventory | stock in/out |
| HR Officer | ngozi@omnicrm.com | hr | sees all dept channels |
| Accountant | yemi@omnicrm.com | account | invoices, orders, wallet |
| Support | chuka@omnicrm.com | chuka-demo | |

## Guest

| Role | Email | Password | Notes |
|---|---|---|---|
| Guest (read-only) | guest@omnicrm.ng | guest-demo | used by demo links |

## Tier demo accounts (testing only)

| Role | Email | Password | Organization |
|---|---|---|---|
| Tier Demo - Basic | basic@omnicrm.com | basic-demo | Basic |
| Tier Demo - Start | start@omnicrm.com | start-demo | Start |
| Tier Demo - Grow | grow@omnicrm.com | grow-demo | Grow |
| Tier Demo - Scale | scale@omnicrm.com | scale-demo | Scale |

Basic: 1 staff, 100 contacts, no channels. Start: 3 staff, 500 contacts, WhatsApp only. Grow: 10 staff, 5,000 contacts, all 5 channels. Scale: unlimited.

## Removed (27 Nov)

Demo admins (zoria@, besconglobal@, jacoco@omnicrm.com) were cleaned from the CRM and the sheet. New signups appear automatically in the sheet via real-time sync. The login screen no longer shows any demo credentials.
