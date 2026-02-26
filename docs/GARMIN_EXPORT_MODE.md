# Garmin Export Mode (Individual Athlete)

This mode is designed for athletes who use Garmin Connect but do not have enterprise Garmin API access.

## Why this mode

Garmin Connect API access is typically restricted to approved business developers. For individual use, export-based ingestion is the practical path.

## Supported flow

1. Export sleep data from Garmin Connect as JSON/CSV.
2. Upload file in Profile -> Garmin Connect panel.
3. The app imports parsed records into:
   - `wellness_sleep_sessions` (sleep)
   - `wellness_daily_metrics` (HRV, stress, body battery, readiness, HR, steps, etc.)
   - `garmin_connect_raw_records` (raw capture for full-fidelity retention)
4. Coach context automatically uses imported wellness metrics on subsequent `/api/coach/chat` turns.

## Endpoint

- `POST /api/wellness/garmin/import` (multipart `file`)
- `GET /api/wellness/garmin/status`
- `POST /api/wellness/garmin/connect`
- `POST /api/wellness/garmin/sync`

Accepted file types:

- `.json`
- `.csv`

Current scope:

- Sleep data import
- Daily wellness metrics import (including HRV and related recovery metrics when present)
- Nutrition is still manual/camera-assisted in v1

UI:

1. Top nav Menu includes `Connect Garmin` and `Manual Garmin sync`.
2. Profile -> Garmin Connect includes full Garmin connect/import/sync controls.

## Athlete walkthrough (export file)

1. Go to Garmin Account Management: https://www.garmin.com/account/datamanagement/
2. Sign in and open **Export Your Data**.
3. Request export and wait for the Garmin email (can take up to 48 hours).
4. Download the provided zip and unzip locally.
5. Locate JSON/CSV wellness files (sleep / daily metrics).
6. In GRAAFIN, open **Profile & Connections -> Garmin Connect**, upload the file, then run **Manual sync**.

## Notes

1. Zip archive ingestion is not included in this version.
2. Imported Garmin canonical rows are stored with `source='other'` and `raw_data.provider='garmin_connect_export'`.
3. Every parsed row is also stored in `garmin_connect_raw_records` for schema evolution and re-processing.
