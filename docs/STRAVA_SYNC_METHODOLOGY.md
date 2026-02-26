# Strava Sync Methodology (Current Baseline)

## Purpose
This documents the current contract between GRAAFIN and the external `strava-sync` service for syncing activities (including Garmin-uploaded activities that land in Strava) into Supabase.

## Current architecture
1. Garmin watch uploads activity to Strava.
2. `strava-sync` fetches activities from Strava API.
3. `strava-sync` writes/upserts activity rows into Supabase.
4. GRAAFIN reads Supabase tables for dashboard/query views.
5. GRAAFIN can request a sync run through `POST /api/sync/trigger` (GitHub workflow dispatch or webhook trigger backend).

`strava-sync` is external to this repo. This repo only triggers it and reads resulting data.

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
- Supports two trigger backends:
  - GitHub workflow dispatch (`STRAVA_SYNC_GITHUB_*` env vars)
  - Webhook (`STRAVA_SYNC_WEBHOOK_URL` + optional bearer token)
- Uses a 12s timeout and surfaces upstream status/body preview on failures.

For `cmogle/strava-sync`:
- Recommended backend is GitHub workflow dispatch of `fionnuala-manual-sync.yml`.

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
- Current app queries do not scope activities by athlete/user id.
- Connection status is inferred from any available activity row.
- To scale beyond a single athlete profile, add explicit athlete scoping in every read path.
