# Setup & Integrations

## 1) Supabase + Google OAuth

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `OPENAI_API_KEY` (for coach orchestration)
- `CHECKIN_JOB_TOKEN` (for `/api/jobs/checkin-daily`)

In Supabase dashboard:
- Auth -> Providers -> enable Google
- Add redirect URL(s):
  - `http://localhost:3000/auth/callback`
  - `https://<your-vercel-domain>/auth/callback`

## 2) Strava connection status (what it means)

Dashboard status is currently inferred from Supabase data:
- **Connected**: at least one row exists in `strava_activities`
- **Last successful sync**: read from `strava_sync_state` (best-effort column detection)
- **Latest activity summary**: latest row in `strava_activities`

## 3) Manual sync trigger env vars

### `STRAVA_SYNC_WEBHOOK_URL`
This must be an HTTP endpoint that triggers your sync pipeline (`strava-sync`).

Where to get it:
- If `strava-sync` is deployed as a web service/job endpoint, use that URL.
- If not deployed yet, create a small endpoint in `strava-sync` (e.g. `/sync/trigger`) and deploy it (Render/Railway/Fly/Vercel serverless/etc.).

### `STRAVA_SYNC_WEBHOOK_TOKEN`
Shared secret you define yourself.

Where to get it:
- Generate a random token (e.g. `openssl rand -hex 32`)
- Set same token in both places:
  - GRAAFIN env: `STRAVA_SYNC_WEBHOOK_TOKEN`
  - strava-sync service env (for auth validation)

Example expected behavior:
- GRAAFIN calls `POST STRAVA_SYNC_WEBHOOK_URL` with optional `Authorization: Bearer <token>`
- strava-sync validates token, kicks job, returns 200
- GRAAFIN times out trigger requests after 12s and surfaces upstream status on failures
- App launch auto-triggers sync in the background with smart throttling:
  - client cooldown: 20 minutes
  - server hard floor: 3 minutes
  - server app-launch soft cooldown: 30 minutes unless activity looks stale
- Manual override is available in `Profile -> Connected services -> Advanced data sync controls`
- Daily fallback cron route: `POST /api/jobs/strava-sync-daily` with `CHECKIN_JOB_TOKEN`

## 4) Current DB assumptions

The app currently reads:
- `strava_activities` (expects fields like `id,name,type,start_date,distance_m,moving_time_s,average_speed`)
- `strava_sync_state` (best-effort for `last_success_at` / `last_synced_at` / `synced_at` / `updated_at`)

See `docs/STRAVA_SYNC_METHODOLOGY.md` for the full sync contract and validation checklist.

## 5) Security notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Keep sync webhook token server-only.
- Keep RLS enabled for app-owned tables.
- Keep `CHECKIN_JOB_TOKEN` server-only.

## 6) Coach + mobile schema

Run:
- `docs/SUPABASE_COACH_SCHEMA.sql`

This enables:
- mobile cockpit persistence tables (`activity_daily_facts`, `training_load_daily`)
- GPT coach tables (`coach_threads`, `coach_messages`, `coach_memory_items`, `coach_checkins`, `coach_agent_traces`)
