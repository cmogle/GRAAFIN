-- Fix Strava token/sync upsert conflict target.
-- The app uses ON CONFLICT (athlete_id,key), which requires a non-partial unique index.

drop index if exists public.strava_sync_state_athlete_key_uidx;

create unique index if not exists strava_sync_state_athlete_key_uidx
  on public.strava_sync_state (athlete_id, key);
