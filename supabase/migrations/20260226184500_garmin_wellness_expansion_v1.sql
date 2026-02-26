create extension if not exists pgcrypto;

create table if not exists public.wellness_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_date date not null,
  source text not null default 'other',
  confidence numeric(5, 2) not null default 0.75,
  steps integer,
  distance_km numeric(9, 2),
  calories_total numeric(10, 2),
  calories_active numeric(10, 2),
  intensity_minutes integer,
  resting_hr numeric(6, 2),
  avg_hr numeric(6, 2),
  min_hr numeric(6, 2),
  max_hr numeric(6, 2),
  hrv numeric(8, 2),
  stress_avg numeric(6, 2),
  stress_max numeric(6, 2),
  body_battery_avg numeric(6, 2),
  body_battery_min numeric(6, 2),
  body_battery_max numeric(6, 2),
  respiration_avg numeric(6, 2),
  spo2_avg numeric(6, 2),
  training_readiness numeric(6, 2),
  recovery_hours numeric(8, 2),
  vo2_max numeric(6, 2),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric_date, source),
  constraint wellness_daily_metrics_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create table if not exists public.garmin_connect_raw_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_type text not null,
  record_date date,
  row_hash text not null,
  source_file_name text,
  source_format text not null default 'unknown',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, row_hash),
  constraint garmin_connect_raw_records_metric_type_check
    check (metric_type in ('sleep', 'daily_metrics', 'activity', 'body', 'other'))
);

create index if not exists wellness_daily_metrics_user_date_idx
  on public.wellness_daily_metrics (user_id, metric_date desc);

create index if not exists garmin_connect_raw_records_user_date_idx
  on public.garmin_connect_raw_records (user_id, record_date desc);

drop trigger if exists wellness_daily_metrics_set_updated_at on public.wellness_daily_metrics;
create trigger wellness_daily_metrics_set_updated_at
before update on public.wellness_daily_metrics
for each row execute function public.touch_wellness_updated_at();

alter table public.wellness_daily_metrics enable row level security;
alter table public.garmin_connect_raw_records enable row level security;

drop policy if exists "Users can manage wellness daily metrics" on public.wellness_daily_metrics;
create policy "Users can manage wellness daily metrics"
  on public.wellness_daily_metrics
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage Garmin raw records" on public.garmin_connect_raw_records;
create policy "Users can manage Garmin raw records"
  on public.garmin_connect_raw_records
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
