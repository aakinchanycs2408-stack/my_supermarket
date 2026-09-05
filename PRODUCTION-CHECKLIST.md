# Production Checklist

## Infrastructure

- [ ] Managed PostgreSQL created
- [ ] `DATABASE_URL` configured with SSL as required
- [ ] Strong `JWT_SECRET` configured
- [ ] Backend deployed independently from Vercel
- [ ] Vercel `VITE_API_URL` points to the deployed API
- [ ] Backend `FRONTEND_URL` matches the exact Vercel origin
- [ ] TLS, backups, monitoring, and rollback plan configured

## Application security

- [x] Helmet security headers enabled
- [x] CORS allow-list enabled
- [x] Login rate limiting enabled
- [x] Request body size limit enabled
- [x] Production secret validation enabled
- [x] Active user checked on authenticated requests
- [x] Shop scope derived from authenticated user
- [ ] HttpOnly cookie authentication or documented bearer-token risk reviewed
- [ ] Password reset and account recovery flow implemented

## Data and financial integrity

- [x] Prisma migration baseline committed
- [x] Atomic sale transaction
- [x] Conditional stock deduction
- [x] Sale idempotency key persistence
- [x] Shop/year invoice counter
- [x] Historical unit cost snapshot
- [x] Credit sale requires a customer
- [x] Discount and payment coverage validation
- [ ] Full customer settlement ledger
- [ ] Refund payment records and tax/discount allocation
- [ ] Cash register and shift management
- [ ] Decimal rounding policy reviewed with accounting

## Verification

- [ ] `npm run db:migrate` against production PostgreSQL
- [x] `npm run build`
- [ ] Automated integration tests pass against PostgreSQL
- [ ] Multi-shop isolation tests pass
- [ ] Concurrent sale tests pass
- [ ] Deployed health check passes
- [ ] Deployed login and billing smoke tests pass
- [ ] Browser receipt print/reprint verified

This checklist deliberately marks unfinished compliance and operational work instead of claiming those features are complete.
