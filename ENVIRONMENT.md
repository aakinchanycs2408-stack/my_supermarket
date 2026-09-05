# Environment Variables

## Backend

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | yes | Managed PostgreSQL connection string. Use SSL in production. |
| `JWT_SECRET` | yes in production | Random secret of at least 32 characters. Never use a repository default. |
| `JWT_EXPIRES_IN` | no | JWT lifetime, such as `8h`. |
| `PORT` | no | Hosting platform port; defaults to `4000` locally. |
| `NODE_ENV` | yes in production | Set to `production`. |
| `FRONTEND_URL` | yes in production | Comma-separated exact browser origins allowed by CORS. |

## Frontend

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_API_URL` | yes for split deployment | API prefix, such as `https://api.example.com/api`. |

Do not commit `.env` files, credentials, database URLs containing passwords, JWTs, or generated database files. `.env.example` contains safe placeholders only.
