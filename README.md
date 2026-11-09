# J.A Electronics

Next.js App Router wholesale management application with MongoDB/Mongoose.

## Setup

1. Run `npm install`. Start a MongoDB replica set locally, or set `MONGODB_URI` in `.env.local` to an Atlas/replica-set URI. A replica set is required for atomic initialization and stock transactions.
2. Run `npm run dev` (or `npm run build && npm start`). On a database with no employees, the server automatically creates the initial Admin account and default locations. If MongoDB is temporarily unavailable at startup, initialization is retried on login. Existing installations are not modified and a deleted seeded admin is not recreated. Passwords are bcrypt-hashed; authentication always checks the database.
3. The first-run credentials are `tehami` / `AdminPassword2026!`. **These credentials are publicly known: change the password immediately and do not expose a fresh installation to an untrusted network.** To change it, sign in and edit the administrator in Employees.
4. If `SESSION_SECRET` is not set, the server generates an ephemeral random value at startup and all sessions expire on restart. For multi-instance or persistent deployments, set the same unique random `SESSION_SECRET` (at least 32 characters) across instances.
5. Employees of type Admin have full access; Salesmen and roles named Cashier/Salesman are POS-only. Use `/locations` to retire locations and `/inventory/transfer` to move stock.

APIs re-check the employee and effective scope from MongoDB on every request. The middleware validates a signed, expiring session and restricts POS-only users to `/pos` and a small POS API allowlist. Employee edits invalidate existing sessions at the API layer; deleted accounts and changed scope are also rejected. Middleware cannot query MongoDB and may still serve a page shell from a previously valid cookie until expiry, but data APIs reject invalidated sessions. Sign in again after upgrading existing sessions. Override approval uses an authorized employee's username and password, creates a two-minute signed authorization, and is recorded in audit logs. Set `POS_FLAT_DISCOUNT_THRESHOLD` to the amount allowed without approval; custom percentage discounts require approval unless permitted. Stock reports refresh on demand and when the tab becomes visible; no automatic polling runs.

## Important limitations

This is not yet production-ready. Login and manager authorization have a MongoDB-backed per-username temporary lockout, but no IP/global rate limiter, MFA, password reset, or dedicated session administration. Employee edits invalidate API sessions; logout clears only the current browser cookie and does not revoke a stolen token. Administrative permission checks and security require independent penetration testing and deployment review before use with real financial or employee data. Attachments are stored in local `uploads/`, not shared object storage, and can be orphaned after a failed purchase; add durable storage, content inspection and malware scanning. Reports load client-side without server pagination and do not support high-volume workloads. Existing data containing additional legacy location names requires a manual migration before use. Initial inventory manually entered is not counted as purchase inflow. POS supports manual serial entry, but its serialized-unit and warranty workflows are incomplete. Browser printing cannot be restricted once a user can read data. Cart removal authorization is an interface control for an unsaved cart, while saved transaction deletion is not implemented. Legacy role-less employees cannot sign in usefully until assigned a role.

## HR, ledger, and sample data

`/hr` provides attendance, advances, and immutable monthly salary slips. Salary generation snapshots the employee's current salary and commission rate, sums that month's net POS sales using Pakistan local calendar boundaries, then deducts outstanding advances oldest-first. Review historical sales, advances and salary structures before generating slips; regenerating or reversing a slip is not currently supported. Payroll is restricted to Admin accounts under the current strict role policy.

The party ledger reconstructs transaction balances and records partial cash/bank payments. Customer credit limits require approval via an employee with `parties.discount`; this permission also controls changes to credit limits. Purchase costs use a weighted average from the point this feature is introduced; historic stock is not automatically revalued. CSV and XLSX export is available on stock, bill-wise sales, and party ledger views; Print / PDF uses the browser's print-to-PDF function.

For **disposable demo databases only**, after the initial automatic seed run `ALLOW_DEMO_SEED=yes node --env-file=.env.local scripts/seed-demo.mjs`. The bulk fixture creates 80 products, 32 customers, 12 suppliers, 20 sales employees, 60 sales, 60 purchases, and 50 expense/income entries. It clears prior fixture collections while preserving the existing admin account and active locations, so it is safe to rerun only against the disposable database. It needs a replica set. Never seed a live ledger.

Remaining gaps include cheque clearance, a complete serialized-unit/warranty register and warranty cards, server-enforced one-use/amount-bound approval tokens, profitability and full P&L reporting, complete report exports/filter combinations, historical migration and reconciliation tooling, financial rounding controls, automated tests, and server-side pagination. Serial entry is supported on POS for items with serial numbers, but barcode hardware and warranty workflows have not been tested. Stock figures and commission/payroll output should not be used for real operations until reviewed and integration-tested. Existing security limitations above still apply.

### Temporary UI review mode

`PREVIEW_BYPASS_AUTH=true` in `.env.local` enables an authentication bypass **only under `npm run dev`**. Page guards are bypassed and database-backed API requests act as the first existing Admin, if one exists. With no database or Admin account, pages remain viewable but database actions and data loading are unavailable. A banner indicates that review mode is active. Writes in this mode are real; never use it on a public or shared network or with sensitive data. To restore development protections, remove the variable or set it to `false` and restart. Production (`npm start`) ignores this flag and retains authentication.

### Dashboard calculations

The dashboard filters use the Pakistan calendar, with Monday as the first day of the week and calendar quarters. Revenue is net sales in the selected period. Receivables and aging are reconstructed from all recorded customer sales and payments through the selected period's end, applying payments to the oldest invoice first; opening balances and unrecorded history cannot be reconstructed. The cash-flow chart shows only amounts paid on sales and purchases at entry, excluding separately recorded ledger settlements. Product revenue allocates each sale's net total in proportion to its line totals. Gross profit is only estimated from stored sale-time item cost snapshots, and is flagged incomplete if any are missing. Net profit is deliberately unavailable because operating expenses and income taxes are not fully recorded. Dashboard CSV exports contain these same summary values; PDF uses browser print.


### Performance and disposable test data

The dashboard chart is loaded in a separate client chunk. Screens request only their required datasets; stock reports refresh manually or on visibility changes. MongoDB model indexes cover inventory `locationId` (the godown reference), transaction `partyId`/date and location/date. Index declarations do not prove indexes are built in a deployed database: inspect and create them using your deployment's normal migration process. The transaction listing and reports still load all matching records into memory; server-side pagination and aggregation are needed for high-volume deployments.

Optional sample tooling is **not run automatically** and must be used only on a throwaway replica-set database named exactly `ja_electronics_disposable_test`. It deliberately does not use the normal `MONGODB_URI` for its operations. Back up and verify the target first.

1. Point a separate application instance at that isolated database so it can initialize the test Admin. Never point a production app at it.
2. Explicitly set `TEST_MONGODB_URI` to the isolated URI including the exact database name, and set `ALLOW_DISPOSABLE_SEED=yes`, then run `npm run demo:seed`. It refuses to run if items, parties or transactions already exist.
3. After review, stop all instances using the test DB. Keep the same `TEST_MONGODB_URI`, set `ALLOW_DESTRUCTIVE_TEST_DB_DROP=ja_electronics_disposable_test`, then run `npm run demo:cleanup`. **This drops the entire disposable database, including its test admin and any records created during review.** The cleanup requires the exact name and a fixture marker. It does not clean any other database.

Neither the seed nor the cleanup script has been executed or verified against a database in this change; review and test them before use.

### Client navigation and additional modules

The client navigation includes `/sales`, `/purchases`, `/products`, `/categories`, `/customers`, `/suppliers`, `/khata`, `/stock`, `/expenses`, `/incomes`, `/reports` and `/settings` in addition to the existing routes. Categories and cash entries use MongoDB-backed records. Expense/income entries are **not** incorporated into profit and loss or dashboard metrics; store profile settings are **not** yet injected into invoice layouts. Transaction detail panels show the current saved state; a historical status timeline, editing/voiding saved invoices and server-generated PDFs are not implemented. Browser print can be used to print details. Credit/ledger entries currently support customer receipts and supplier payments, not arbitrary journal entries or opening balances.
