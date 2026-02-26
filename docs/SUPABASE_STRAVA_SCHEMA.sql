-- Strava sync baseline tables for GRAAFIN
-- Run in the target Supabase project (fazdbecnxwgkvbxwlrfn)

create extension if not exists pgcrypto;

create table if not exists public.strava_activities (
  id text primary key,
  name text,
  type text,
  start_date timestamptz,
  distance_m numeric,
  moving_time_s numeric,
  average_speed numeric,
  average_heartrate numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strava_sync_state (
  id uuid primary key default gen_random_uuid(),
  source text default 'strava-sync',
  athlete_id bigint,
  key text,
  value text,
  status text,
  started_at timestamptz,
  finished_at timestamptz,
  last_success_at timestamptz,
  last_synced_at timestamptz,
  synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists strava_activities_start_date_idx
  on public.strava_activities (start_date desc);

create index if not exists strava_activities_type_start_date_idx
  on public.strava_activities (type, start_date desc);

create index if not exists strava_sync_state_updated_at_idx
  on public.strava_sync_state (updated_at desc);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists strava_activities_touch_updated_at on public.strava_activities;
create trigger strava_activities_touch_updated_at
before update on public.strava_activities
for each row execute function public.touch_updated_at();

drop trigger if exists strava_sync_state_touch_updated_at on public.strava_sync_state;
create trigger strava_sync_state_touch_updated_at
before update on public.strava_sync_state
for each row execute function public.touch_updated_at();

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

create unique index if not exists strava_sync_state_athlete_key_uidx
  on public.strava_sync_state (athlete_id, key)
  where athlete_id is not null and key is not null;
