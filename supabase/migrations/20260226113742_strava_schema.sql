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
