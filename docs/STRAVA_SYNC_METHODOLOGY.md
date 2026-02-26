# Strava Sync Methodology (Current Baseline)

## Purpose
This documents the current in-repo Strava sync contract for ingesting activities (including Garmin-uploaded activities that land in Strava) into Supabase.

## Current architecture
1. Garmin watch uploads activity to Strava.
2. GRAAFIN `internal-strava-sync` refreshes token(s) and fetches activities from Strava API.
3. GRAAFIN upserts activity rows into Supabase (`strava_activities`) and updates `strava_sync_state`.
4. Dashboard/query/coach views read Supabase tables for analysis.
5. Sync runs are requested through `POST /api/sync/trigger` (default: internal mode).

Legacy fallback modes (`github`/`webhook`) remain available but are not required.

## Required Supabase tables

### `strava_activities`
Minimum columns used by GRAAFIN:
- `id` (text or bigint-as-text, unique Strava activity id)
- `name` (text)
- `type` (text, e.g. `Run`)
- `start_date` (timestamptz / ISO string)
- `distance_m` (numeric)
- `moving_time_s` (numeric)
- `average_speed` (numeric, nullable)
- `average_heartrate` (numeric, nullable)

Recommended ingestion behavior:
- Upsert by `id` (idempotent syncs).
- Preserve all Strava activity types; GRAAFIN filters to `type = 'Run'` for run analytics.
- Always set `athlete_id` for multi-athlete coexistence.
- Keep raw metric units from Strava (`m`, `s`) to avoid conversion drift.

### `strava_sync_state`
Minimum columns used by GRAAFIN (best-effort):
- one of `last_success_at`, `last_synced_at`, `synced_at`, or `updated_at`

Recommended ingestion behavior:
- Write one row per sync run (or maintain a single row consistently).
- Always update at least one timestamp field from the list above.

## Manual trigger contract
`POST /api/sync/trigger` in GRAAFIN:
- Requires authenticated user.
- Supports backends:
  - Internal Strava sync (`STRAVA_SYNC_TRIGGER_MODE=internal`, default)
  - GitHub workflow dispatch (`STRAVA_SYNC_GITHUB_*` env vars)
  - Webhook (`STRAVA_SYNC_WEBHOOK_URL` + optional bearer token)
- Uses a 12s timeout and surfaces upstream status/body preview on failures.

Multi-athlete sync behavior:
- Sync worker can ingest multiple athlete credentials in one run.
- App analysis remains scoped to `APP_PRIMARY_ATHLETE_ID` (Fionnuala by default).

## Dashboard analytics currently driven by this data
- Distance trend (last 8 weeks).
- Weekly load delta versus trailing baseline.
- 8-week volume, average pace, intensity split.
- Run-type evolution by distance bands.
- Marathon-block patterns with July 2025 anomaly suppression rule.

## Quick verification checklist
Run these in Supabase SQL editor:

```sql
select count(*) as total_activities from strava_activities;
select type, count(*) from strava_activities group by 1 order by 2 desc;
select max(start_date) as latest_activity_at from strava_activities;
select max(coalesce(last_success_at, last_synced_at, synced_at, updated_at)) as latest_sync_at from strava_sync_state;
```

If these return sane values and `Run` rows are present, GRAAFIN's dashboard should populate.

## Known scaling limits (important for multi-athlete)
- Analysis views are currently hard-scoped to one primary athlete (`APP_PRIMARY_ATHLETE_ID`).
- Multi-athlete switching UI is not implemented yet.
- Training/coach per-athlete profile switching is not in v1.
