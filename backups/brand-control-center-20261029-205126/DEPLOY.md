# Deploying Kalexi Brokerage (Supabase + Vercel)

## 1. Database (one time)

Open Supabase Dashboard > SQL Editor > New query, paste all of `supabase/setup_all.sql`, Run.
(This creates tables, RLS, functions, and the `kalexi-vault` / `kalexi-avatars` buckets.)
Or with the CLI: `npx supabase link --project-ref alxpwbqthlrexrbycqjp && npx supabase db push`.
For an existing installation, apply pending migrations with `npx supabase db push`, including
`20261022190000_agent_phone_signin.sql` and `20261022203000_system_maintenance.sql`, rather than
rerunning the one-time setup script.
Agent cards print at ID-1 dimensions (85.60 × 53.98 mm); print at 100% / actual size. Their QR
links to the live agent verification page, and the Code 128 barcode encodes the agent ID.

Maintenance controls are available inside Admin Control Centre at `/admin/maintenance`, and at
the standalone recovery route `/maintenance`. A Super Admin can preview the page and enable or
disable maintenance after confirming the change.
When enabled, the public maintenance response links to administrator sign-in; the recovery form
uses the existing email or phone authentication flow and does not grant access based on the
identifier. Direct authenticated-route requests load only the client shell and must pass a
server-verified Super Admin check before protected routes render.
Enabling it blocks unauthenticated and ordinary application requests with HTTP 503; signed-in
Super Admins retain access. If the settings database is unavailable, the server fails closed for
ordinary users and displays an availability error instead of claiming maintenance is disabled.
The maintenance page and its controls remain reachable so an administrator can retry after
service recovery.

Auth > URL Configuration: set Site URL to your Vercel URL and add `https://<your-app>.vercel.app/**` to Redirect URLs.

## 2. Vercel

Import the repo (Framework preset: Other/auto-detected; build `npm run build`). Add these env vars (Production + Preview):

| Name                          | Value                                    |
| ----------------------------- | ---------------------------------------- |
| SUPABASE_URL                  | https://alxpwbqthlrexrbycqjp.supabase.co |
| SUPABASE_PUBLISHABLE_KEY      | sb_publishable_...                       |
| SUPABASE_SECRET_KEY           | sb_secret_... (server only)              |
| VITE_SUPABASE_URL             | same as SUPABASE_URL                     |
| VITE_SUPABASE_PUBLISHABLE_KEY | same as SUPABASE_PUBLISHABLE_KEY         |

Then Deploy. Nitro detects Vercel automatically.

## 3. First admin

The first user to sign up is automatically made super_admin by the database trigger, so create your own account first.
