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

GRAAFIN supports two remote trigger backends:
- **GitHub Actions workflow dispatch** (recommended for `cmogle/strava-sync`)
- **HTTP webhook** (if you run a sync service endpoint)

Core selector:
- `STRAVA_SYNC_TRIGGER_MODE=auto|github|webhook` (default `auto`)

### Option A: GitHub workflow dispatch (recommended)

Required:
- `STRAVA_SYNC_GITHUB_TOKEN` (PAT or fine-grained token with actions/workflow dispatch permission on `cmogle/strava-sync`)

Optional (defaults shown):
- `STRAVA_SYNC_GITHUB_OWNER=cmogle`
- `STRAVA_SYNC_GITHUB_REPO=strava-sync`
- `STRAVA_SYNC_GITHUB_WORKFLOW=fionnuala-manual-sync.yml`
- `STRAVA_SYNC_GITHUB_REF=main`

Behavior:
- GRAAFIN calls GitHub API:
  - `POST /repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches`
- Uses `sync_mode` input:
  - `incremental` by default
  - `full` when `force=true` is passed

### Option B: HTTP webhook

Required:
- `STRAVA_SYNC_WEBHOOK_URL`

Optional:
- `STRAVA_SYNC_WEBHOOK_TOKEN` (sent as Bearer token)

Behavior:
- GRAAFIN sends `POST STRAVA_SYNC_WEBHOOK_URL`
- Times out after 12s and returns upstream status/body preview on failures

App behavior (same for both backends):
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
- Keep sync webhook token server-only.
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
