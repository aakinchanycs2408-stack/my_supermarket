# Production Deployment

## Architecture

- Frontend: Vite React application on Vercel.
- API: Express TypeScript service on Render or Railway.
- Database: managed PostgreSQL such as Neon, Supabase, or Railway PostgreSQL.

## Backend

1. Create a managed PostgreSQL database and copy its connection string.
2. Configure `DATABASE_URL`, `JWT_SECRET` (32+ random characters), `FRONTEND_URL`, `NODE_ENV=production`, and `PORT` on the backend service.
3. Build and start the service:

```text
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

4. Confirm `GET /api/health` returns `ok: true` and `database: connected`.
5. Run the seed only for an intentional initial setup. Do not run the demo seed against an existing production shop without reviewing it.

Render can use `render.yaml`. The service must expose the platform-provided `PORT` and bind to `0.0.0.0`.

## Frontend

1. Create a Vercel project pointing at this repository.
2. Set `VITE_API_URL` to the deployed API prefix, for example `https://api.example.com/api`.
3. Run the Vercel build with `npm run build` and publish the Vite `dist` directory.
4. Set the same URL in the backend `FRONTEND_URL` allow-list.

## Smoke test

```text
GET https://API_HOST/api/health
POST https://API_HOST/api/auth/login
GET https://API_HOST/api/products (with the returned bearer token)
```

Then verify a product search, sale with an `Idempotency-Key`, inventory deduction, sales history, and a return in the deployed UI.

## Troubleshooting

- CORS errors: ensure the exact Vercel origin is in `FRONTEND_URL`.
- Database unavailable: verify `DATABASE_URL`, SSL requirements, and that `prisma migrate deploy` completed.
- Login rejected: verify the intentional seed/bootstrap user exists and is active.
- API 404 at `/api/api/...`: set `VITE_API_URL` to either the host plus `/api` or the host; the client normalizes the common `/api` form.

The app is not a legal GST certification. GST fields and percentage tax calculation are present, but invoice tax breakup and statutory compliance must be reviewed by the business and tax adviser before use.
