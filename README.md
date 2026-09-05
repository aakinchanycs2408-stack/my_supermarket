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
2. Copy `.env.example` to `.env` (the default uses a local SQLite database)
4. `npm run db:push`
5. `npm run db:seed`
6. `npm run dev`

Demo:
- Admin: `admin@demo.local` / `Admin@123`
- Cashier: `cashier@demo.local` / `Cashier@123`

## Production caveat
Printer hardware integration, cloud backup, CSV import/export, automated test suites, rate limiting, refresh-token sessions, and some advanced screens still require environment-specific implementation and verification. This package does not falsely claim those are complete.
