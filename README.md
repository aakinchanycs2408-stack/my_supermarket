# Retail POS — Final Integrated Project

Built from the supplied master requirements.

## Implemented core
- React/TypeScript/Tailwind UI
- Express/TypeScript API
- PostgreSQL/Prisma data model
- Authentication
- Admin/Cashier roles
- Per-user permissions
- Multi-counter structure
- Product/barcode search
- POS billing
- Server-authoritative totals
- Transactional sales + inventory movements
- Cash/UPI/Card/Credit payment recording
- Customer credit balance
- Sales history
- Returns/refunds API with partial-return quantity validation
- Inventory adjustments + audit logs
- Customer management
- Cashier management
- Expense management
- Revenue/COGS/gross/net profit summary
- Multi-shop data isolation in API queries
- Audit logs for critical operations

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and configure PostgreSQL
3. `npm run db:migrate`
4. `npm run db:seed` for an intentional development/bootstrap setup
5. `npm run dev`

Demo:
- Admin: `admin@demo.local` / `Admin@123`
- Cashier: `cashier@demo.local` / `Cashier@123`

## Production status
Security middleware, restricted CORS, request limits, login rate limiting, active-user checks, PostgreSQL migrations, idempotent sales, atomic stock reservation, safe invoice counters, deployment configuration, and API boundary tests are included. See `PRODUCTION-CHECKLIST.md` for the remaining operational and accounting work that must be completed before a real store deployment.
