alter table if exists public.strava_activities
  add column if not exists athlete_id bigint,
  add column if not exists strava_id bigint,
  add column if not exists sport_type text,
  add column if not exists synced_at timestamptz,
  add column if not exists elapsed_time_s integer,
  add column if not exists total_elevation numeric,
  add column if not exists average_cadence numeric,
  add column if not exists average_watts numeric,
  add column if not exists max_watts numeric,
  add column if not exists max_speed numeric,
  add column if not exists max_heartrate numeric,
  add column if not exists calories numeric,
  add column if not exists kilojoules numeric,
  add column if not exists suffer_score numeric,
  add column if not exists kudos_count integer,
  add column if not exists pr_count integer,
  add column if not exists has_streams boolean,
  add column if not exists commute boolean,
  add column if not exists manual boolean,
  add column if not exists trainer boolean,
  add column if not exists gear_id text,
  add column if not exists description text,
  add column if not exists device_name text,
  add column if not exists start_latlng jsonb,
  add column if not exists end_latlng jsonb,
  add column if not exists raw_json jsonb;

create unique index if not exists strava_activities_strava_id_uidx
  on public.strava_activities (strava_id)
  where strava_id is not null;

create index if not exists strava_activities_athlete_start_idx
  on public.strava_activities (athlete_id, start_date desc);

alter table if exists public.strava_sync_state
  add column if not exists athlete_id bigint,
  add column if not exists key text,
  add column if not exists value text;

create unique index if not exists strava_sync_state_athlete_key_uidx
  on public.strava_sync_state (athlete_id, key)
  where athlete_id is not null and key is not null;
