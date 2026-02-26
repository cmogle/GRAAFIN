# Supabase Consolidation Runbook

Goal: consolidate GRAAFIN app + Strava sync data into the primary Supabase project:
- primary: `fazdbecnxwgkvbxwlrfn`
- legacy sync project: `ojbabtylwdggdhdigmwj`

## 1) Prepare target schema (fazdb...)

Run in Supabase SQL Editor for `fazdbecnxwgkvbxwlrfn`:
- `docs/SUPABASE_STRAVA_SCHEMA.sql`
- `docs/SUPABASE_COACH_SCHEMA.sql`
- `docs/SUPABASE_TRAINING_PLAN_SCHEMA.sql` (if not already applied)

## 2) Migrate existing Strava data

Set env vars in your shell (one-time):

```bash
export SOURCE_SUPABASE_URL="https://ojbabtylwdggdhdigmwj.supabase.co"
export SOURCE_SUPABASE_SERVICE_ROLE_KEY="<legacy service role key>"
export TARGET_SUPABASE_URL="https://fazdbecnxwgkvbxwlrfn.supabase.co"
export TARGET_SUPABASE_SERVICE_ROLE_KEY="<primary service role key>"
```

Dry run:

```bash
MIGRATION_DRY_RUN=true node scripts/migrate-strava-data.mjs
```

Actual migration:

```bash
node scripts/migrate-strava-data.mjs
```

## 3) Repoint strava-sync writer to fazdb...

In your `strava-sync` deployment environment (Render/Railway/etc):
- set `SUPABASE_URL=https://fazdbecnxwgkvbxwlrfn.supabase.co`
- set `SUPABASE_SERVICE_ROLE_KEY=<fazdb service role key>`
- redeploy the sync service

Do not change `STRAVA_SYNC_WEBHOOK_URL` in GRAAFIN unless the endpoint URL itself changed.

## 4) Confirm GRAAFIN runtime points to fazdb...

In Vercel project env (Production + Preview):
- `NEXT_PUBLIC_SUPABASE_URL=https://fazdbecnxwgkvbxwlrfn.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<fazdb anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<fazdb service role key>`
- `EXPECTED_SUPABASE_PROJECT_REF=fazdbecnxwgkvbxwlrfn`

Then redeploy `main`.

## 5) Validation SQL

Run in both projects to compare counts:

```sql
select count(*) as total_activities from strava_activities;
select type, count(*) from strava_activities group by 1 order by 2 desc;
select max(start_date) as latest_activity_at from strava_activities;
select max(coalesce(last_success_at, last_synced_at, synced_at, updated_at)) as latest_sync_at
from strava_sync_state;
```

Expected after cutover:
- `fazdb...` continues increasing after new sync runs.
- `ojbab...` remains static (legacy archive).

## 6) Post-cutover smoke checks

1. Open `/dashboard` and verify latest run appears.
2. Open `/coach` and send a message (thread persists).
3. Trigger `/api/sync/trigger` and verify `latest_sync_at` updates in `fazdb...`.
