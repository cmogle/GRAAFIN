# Wellness Inputs v1

This release adds scaffolding for additional athlete inputs:

1. Sleep ingestion and context (`wellness_sleep_sessions`)
2. Nutrition ingestion and context (`wellness_nutrition_entries`)
3. Camera-meal workflow status (`recognition_status`, `recognized_items`)
4. Data-source registry (`wellness_data_sources`) for future Whoop/Oura integrations
5. Garmin expansion tables for broad wellness capture (`wellness_daily_metrics`, `garmin_connect_raw_records`)

## Migration

Run:

- `/Users/conorogle/Development/GRAAFIN/supabase/migrations/20260226173000_wellness_inputs_v1.sql`
- `/Users/conorogle/Development/GRAAFIN/supabase/migrations/20260226184500_garmin_wellness_expansion_v1.sql`

## API

- `GET /api/wellness/context`
- `POST /api/wellness/sleep`
- `POST /api/wellness/nutrition`
- `POST /api/wellness/nutrition/recognize`

## Coach integration

`/api/coach/chat` now loads a `WellnessSnapshot` (when enabled) and injects:

1. wellness data quality
2. wellness risk flags
3. wellness insights

into the v2 orchestrator context and fallback logic.

## Notes on camera recognition

Current behavior is a pipeline placeholder:

1. Nutrition entries with `photoUrl` are created with `recognition_status='pending'`.
2. `/api/wellness/nutrition/recognize` updates recognized items and flips status to `processed`.
3. Vision model integration can later replace the manual recognizer update call without schema changes.
