# HR Module & Role-Based Access

> Owner note: HR panel for staff management, onboarding, salaries, salary advances,
> pension, HMO; plus a switch controlling which features an organization can access,
> and staff assigned to departments so nobody sees what doesn't concern them.

## 1. HR panel (dashboard → 🧑💼 HR)

- **Stats:** headcount, monthly payroll, monthly pension (pension_rate % of salary),
  pending advance total, open leave requests, onboarding in progress.
- **Staff tab:** full list (avatar, name/role, email/phone, department chip, onboarding
  stage chip, salary) with add/edit. Fields: name, email, phone, department, role,
  salary, bank, pension %, HMO plan, onboarding stage (invited → documents →
  orientation → active), next of kin, optional login password.
- **Advances tab:** salary advance requests (amount, reason, status
  pending → approved → repaid) with Approve / Mark repaid actions.
- **Leave tab:** leave requests (annual/sick/maternity/paternity/unpaid, dates,
  status pending/approved/rejected) with approve/reject.

## 2. Role-based access (departments)

- Staff with a login password can sign in; the JWT carries `dept`.
- Permission map (backend `SECTION_ACCESS` + mirrored `FRONT_ACCESS`):
  - sales: dashboard/sales, customers, inbox, invoices, follow-ups, feedback, reports, pipeline
  - support: dashboard/support, inbox, feedback, reports
  - inventory: dashboard, inventory, product, reports
  - hr: dashboard, hr, reports
  - account: dashboard, invoices, reports
- Enforcement on BOTH sides: API `gate(section)` preHandler returns 403 for
  out-of-department routes; the UI filters nav, bottom nav, and department pills.
  Owner (no `dept` claim) sees everything.

## 3. Organisation feature switches

- Account → "Feature access": owner toggles Customers / Inbox / Invoicing /
  Follow-ups / Feedback / Reports / Ads / HR / Pipeline on or off
  (`PUT /org/features`, stored in `org_settings`). Disabled sections disappear
  from every staff member's nav instantly; owner-only endpoint.

## 4. Data model

- `staff(user_id, name, email, phone, department, role, salary, bank, pension_rate,
  hmo_plan, onboarding, status, can_login, password_hash, start_date, next_of_kin)`
- `salary_advances(user_id, staff_id, amount, reason, status, requested_at)`
- `leaves(user_id, staff_id, type, start_date, end_date, status, created_at)`
- `org_settings(user_id, key, value)` — feature toggles JSON under key `features`.

## 5. API

`GET /hr-dashboard`, `POST/PUT/DELETE /staff`, `POST /salary-advances`,
`PUT /salary-advances/:id` (status), `POST /leaves`, `PUT /leaves/:id` (status),
`GET/PUT /org/features`. Staff login via the normal `/auth/login` (staff table
fallback when the email isn't an owner account).

## 6. Next phases

- Payroll runs (bulk salary payment records), payslip generation, statutory remittance
  schedule (PAYE, pension, NSITF), attendance/clock-in, staff self-service portal
  (see own payslips/advance balance/leave days).
