create extension if not exists pgcrypto;

create table if not exists public.wellness_data_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  external_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  constraint wellness_data_sources_provider_check
    check (provider in ('manual', 'whoop', 'oura', 'apple_health', 'other')),
  constraint wellness_data_sources_status_check
    check (status in ('connected', 'disconnected', 'pending', 'error'))
);

create table if not exists public.wellness_sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid references public.wellness_data_sources (id) on delete set null,
  sleep_date date not null,
  bedtime timestamptz,
  wake_time timestamptz,
  total_sleep_min integer,
  rem_sleep_min integer,
  deep_sleep_min integer,
  resting_hr numeric(6, 2),
  hrv numeric(8, 2),
  sleep_score numeric(5, 2),
  readiness_score numeric(5, 2),
  source text not null default 'manual',
  confidence numeric(5, 2) not null default 0.70,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellness_sleep_sessions_source_check
    check (source in ('manual', 'whoop', 'oura', 'apple_health', 'other')),
  constraint wellness_sleep_sessions_confidence_check
    check (confidence >= 0 and confidence <= 1),
  unique (user_id, sleep_date, source)
);

create table if not exists public.wellness_nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid references public.wellness_data_sources (id) on delete set null,
  meal_time timestamptz not null default now(),
  meal_type text,
  description text,
  calories numeric(10, 2),
  carbs_g numeric(10, 2),
  protein_g numeric(10, 2),
  fat_g numeric(10, 2),
  hydration_ml numeric(10, 2),
  photo_url text,
  recognition_status text not null default 'none',
  recognized_items jsonb not null default '[]'::jsonb,
  source text not null default 'manual',
  confidence numeric(5, 2) not null default 0.65,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellness_nutrition_entries_source_check
    check (source in ('manual', 'camera', 'myfitnesspal', 'whoop', 'other')),
  constraint wellness_nutrition_entries_recognition_status_check
    check (recognition_status in ('none', 'pending', 'processed', 'failed')),
  constraint wellness_nutrition_entries_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists wellness_sleep_sessions_user_date_idx
  on public.wellness_sleep_sessions (user_id, sleep_date desc);

create index if not exists wellness_nutrition_entries_user_time_idx
  on public.wellness_nutrition_entries (user_id, meal_time desc);

create index if not exists wellness_nutrition_entries_recognition_idx
  on public.wellness_nutrition_entries (recognition_status, created_at desc);

create or replace function public.touch_wellness_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists wellness_data_sources_set_updated_at on public.wellness_data_sources;
create trigger wellness_data_sources_set_updated_at
before update on public.wellness_data_sources
for each row execute function public.touch_wellness_updated_at();

drop trigger if exists wellness_sleep_sessions_set_updated_at on public.wellness_sleep_sessions;
create trigger wellness_sleep_sessions_set_updated_at
before update on public.wellness_sleep_sessions
for each row execute function public.touch_wellness_updated_at();

drop trigger if exists wellness_nutrition_entries_set_updated_at on public.wellness_nutrition_entries;
create trigger wellness_nutrition_entries_set_updated_at
before update on public.wellness_nutrition_entries
for each row execute function public.touch_wellness_updated_at();

alter table public.wellness_data_sources enable row level security;
alter table public.wellness_sleep_sessions enable row level security;
alter table public.wellness_nutrition_entries enable row level security;

drop policy if exists "Users can manage wellness data sources" on public.wellness_data_sources;
create policy "Users can manage wellness data sources"
  on public.wellness_data_sources
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage wellness sleep sessions" on public.wellness_sleep_sessions;
create policy "Users can manage wellness sleep sessions"
  on public.wellness_sleep_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage wellness nutrition entries" on public.wellness_nutrition_entries;
create policy "Users can manage wellness nutrition entries"
  on public.wellness_nutrition_entries
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
