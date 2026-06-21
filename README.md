# RallyFire

RallyFire is a Vite/React competition dashboard deployed on Vercel. Supabase provides password authentication and Postgres; Vercel Node functions enforce administrator roles, eight-hour admin grants, competition rules, and the append-only points ledger.

## Authentication model

- There is no SSO, social login, or shared Vercel password.
- Administrators use invitation-only Supabase email/password accounts.
- `superadmin` can invite, promote, disable, revoke, configure seasons, void sessions, and export data.
- `admin` can manage the roster, attendance, draws, scores, and points.
- The first verified login whose email exactly matches `INITIAL_SUPERADMIN_EMAIL` creates the initial database superadmin, but only while the membership table is empty.
- Each Supabase `session_id` receives one nonrenewable admin grant. After eight hours, the API returns `reauth_required`; the browser signs out and requires a fresh password login.
- MFA is intentionally deferred for this MVP. A future version can require Supabase `aal2` without changing the application role model.

## Supabase setup

1. Create separate Supabase projects for production and development/preview.
2. In the Supabase Dashboard, open **Project Settings > API Keys**. Record the project URL, publishable key, and a new server-only `sb_secret_...` key. See [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys).
3. Open **Connect** and record both the pooled transaction connection string and the direct/non-pooling connection string.
4. Set `POSTGRES_URL_NON_POOLING` locally, then run:

   ```bash
   pnpm db:migrate
   ```

5. In **Authentication > Providers > Email**, turn off public user sign-ups. Administrator invitations sent through the service API still work.
6. In **Authentication > URL Configuration**, add the production Vercel URL and `https://your-domain.example/?setup=1` as allowed redirect URLs. Add the equivalent development URLs only to the development Supabase project.
7. In **Authentication > Users**, invite the address configured as `INITIAL_SUPERADMIN_EMAIL`. Open that email, follow the link, and set a password of at least 12 characters. Its first verified login bootstraps the superadmin membership and admin grant.

After bootstrap, invite all other administrators from the RallyFire admin console. Do not create a database row or password hash manually.

## Vercel environment variables

Add these in **Vercel Project > Settings > Environment Variables**. Use the production Supabase project for Production and the development Supabase project for Preview/Development. Vercel documents the environment scopes in [Environment variables](https://vercel.com/docs/projects/environment-variables).

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | Publishable `sb_publishable_...` key |
| `SUPABASE_URL` | Server only | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server only | Secret `sb_secret_...` key for Auth invitations |
| `POSTGRES_URL` | Server only | Pooled Postgres URL used by Vercel functions |
| `POSTGRES_URL_NON_POOLING` | Build/operator only | Direct Postgres URL used by Drizzle migrations |
| `INITIAL_SUPERADMIN_EMAIL` | Server only | Exact initial owner email |
| `ADMIN_SESSION_TTL_HOURS` | Server only | Set to `8` |

Never expose `SUPABASE_SECRET_KEY` or either Postgres URL with a `VITE_` prefix. Redeploy after changing Vercel variables.

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dlx vercel dev
```

Use `vercel dev`, rather than plain `vite`, when testing `/api` functions locally.

## Competition workflow

1. A superadmin creates one active season and its default win/loss awards.
2. An admin adds players with a public display rating and separate internal club skill from 1 to 10.
3. The admin creates one active play session, selects attendees/reserves, and reviews the automatic top-half A / bottom-half B grouping.
4. The server securely shuffles both equal groups, pairs A with B, and creates every unique team matchup.
5. Saved integer scores from 0 to 99 become public on the next ten-second poll. Ties are rejected.
6. Finalization requires every match to be completed. A serializable transaction inserts deterministic ledger entries exactly once using the session's award snapshot.
7. A superadmin can void a finalized session. RallyFire preserves it, writes compensating ledger entries, and can create a replacement draft.

## Operations on Supabase Free

The admin console provides a full JSON data export because Supabase recommends that Free-tier projects maintain off-site exports; automatic daily backups are a paid-plan feature. Free projects can also pause after a week of inactivity. Review [Database Backups](https://supabase.com/docs/guides/platform/backups) and current [Supabase pricing](https://supabase.com/pricing), then move to a paid plan and establish tested backups before promising production availability or relying on the app as the sole record of competition results.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
```
