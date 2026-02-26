# Setup & Integrations

## 1) Supabase + Google OAuth

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `EXPECTED_SUPABASE_PROJECT_REF` (recommended guardrail; set to your primary project ref)
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

## 3) Sync trigger backend env vars

GRAAFIN now supports **in-repo Strava sync** (recommended) and optional legacy remote trigger backends.

Core selector:
- `STRAVA_SYNC_TRIGGER_MODE=internal|auto|github|webhook` (default `internal`)

### Option A: In-repo sync (recommended)

Required:
- `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` + (`STRAVA_REFRESH_TOKEN` or `STRAVA_ACCESS_TOKEN`)

Multi-athlete support (recommended for your setup):
- `FIONNUALA_STRAVA_*` credentials
- `CONOR_STRAVA_*` credentials
- Optional `STRAVA_ATHLETES_JSON` for explicit athlete list
- Analysis scope remains controlled by `APP_PRIMARY_ATHLETE_ID` (set this to Fionnuala)

Behavior:
- GRAAFIN refreshes athlete token(s), fetches Strava activities, and upserts directly into `strava_activities`.
- Sync state and cursors are persisted in `strava_sync_state` per athlete.

### Option B: GitHub workflow dispatch (legacy fallback)

Required:
- `STRAVA_SYNC_GITHUB_TOKEN`

Optional:
- `STRAVA_SYNC_GITHUB_OWNER`
- `STRAVA_SYNC_GITHUB_REPO`
- `STRAVA_SYNC_GITHUB_WORKFLOW`
- `STRAVA_SYNC_GITHUB_REF`

### Option C: HTTP webhook (legacy fallback)

Required:
- `STRAVA_SYNC_WEBHOOK_URL`

Optional:
- `STRAVA_SYNC_WEBHOOK_TOKEN` (sent as Bearer token)

Behavior:
- GRAAFIN sends `POST STRAVA_SYNC_WEBHOOK_URL`
- Times out after 12s and returns upstream status/body preview on failures

App behavior (same for all backends):
- App launch auto-triggers sync in the background with smart throttling:
  - client cooldown: 20 minutes
  - server hard floor: 3 minutes
  - server app-launch soft cooldown: 30 minutes unless activity looks stale
- Manual override is in `Profile -> Connected services -> Advanced data sync controls`
- Daily fallback cron route: `POST /api/jobs/strava-sync-daily` with `CHECKIN_JOB_TOKEN`

## 4) Current DB assumptions

The app currently reads:
- `strava_activities` (expects fields like `id,name,type,start_date,distance_m,moving_time_s,average_speed`)
- `strava_sync_state` (best-effort for `last_success_at` / `last_synced_at` / `synced_at` / `updated_at`)

See `docs/STRAVA_SYNC_METHODOLOGY.md` for the full sync contract and validation checklist.

## 5) Security notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Keep Strava client secrets and refresh tokens server-only.
- Keep sync webhook token and GitHub token server-only.
- Keep RLS enabled for app-owned tables.
- Keep `CHECKIN_JOB_TOKEN` server-only.

## 6) Coach + mobile schema

Run:
- `docs/SUPABASE_COACH_SCHEMA.sql`
- `docs/SUPABASE_STRAVA_SCHEMA.sql` (if Strava tables are not present in this project)

This enables:
- mobile cockpit persistence tables (`activity_daily_facts`, `training_load_daily`)
- GPT coach tables (`coach_threads`, `coach_messages`, `coach_memory_items`, `coach_checkins`, `coach_agent_traces`)

## 7) Consolidation (legacy sync project -> primary project)

If Strava data still lives in an older Supabase project, follow:
- `docs/SUPABASE_CONSOLIDATION_RUNBOOK.md`

One-shot migration script:
- `node scripts/migrate-strava-data.mjs`
