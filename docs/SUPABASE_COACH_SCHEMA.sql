-- Mobile cockpit + GPT coach persistence schema
-- Run in Supabase SQL editor (idempotent, RLS-enabled)
-- For Coach Context/Blocks/Evidence v2 tables, also run:
-- supabase/migrations/20260226160000_coach_intelligence_v2.sql

create extension if not exists pgcrypto;

create table if not exists public.athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade unique,
  display_name text,
  timezone text not null default 'UTC',
  birth_year integer,
  preferred_units text not null default 'metric',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_profiles_birth_year_check
    check (birth_year is null or birth_year between 1900 and 2100),
  constraint athlete_profiles_preferred_units_check
    check (preferred_units in ('metric', 'imperial'))
);

create table if not exists public.activity_daily_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fact_date date not null,
  run_count integer not null default 0,
  run_distance_km numeric(8, 2) not null default 0,
  long_run_count integer not null default 0,
  total_moving_minutes numeric(9, 2) not null default 0,
  cross_training_minutes numeric(9, 2) not null default 0,
  load_score numeric(10, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fact_date)
);

create table if not exists public.training_load_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  load_date date not null,
  acute_load_7 numeric(10, 3) not null default 0,
  chronic_load_42 numeric(10, 3) not null default 0,
  monotony_7 numeric(10, 3) not null default 0,
  strain_7 numeric(10, 3) not null default 0,
  load_ratio numeric(8, 4) not null default 0,
  readiness_score numeric(5, 2) not null default 0,
  readiness_confidence numeric(5, 2) not null default 0,
  missing_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, load_date)
);

create table if not exists public.coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  context_mode text not null default 'balanced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.coach_threads (id) on delete cascade,
  role text not null,
  content text not null,
  confidence numeric(5, 2),
  citations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint coach_messages_role_check
    check (role in ('user', 'assistant', 'system'))
);

create table if not exists public.coach_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  memory_type text not null,
  semantic_key text not null,
  content text not null,
  confidence numeric(5, 2) not null default 0.60,
  source_message_id uuid references public.coach_messages (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, semantic_key)
);

create table if not exists public.coach_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null,
  body text not null,
  readiness_score numeric(5, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

create table if not exists public.coach_agent_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid references public.coach_threads (id) on delete set null,
  message_id uuid references public.coach_messages (id) on delete set null,
  agent_name text not null,
  model text,
  latency_ms integer,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists activity_daily_facts_user_date_idx
  on public.activity_daily_facts (user_id, fact_date desc);

create index if not exists training_load_daily_user_date_idx
  on public.training_load_daily (user_id, load_date desc);

create index if not exists coach_threads_user_updated_idx
  on public.coach_threads (user_id, updated_at desc);

create index if not exists coach_messages_thread_created_idx
  on public.coach_messages (thread_id, created_at desc);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

create index if not exists coach_memory_items_user_updated_idx
  on public.coach_memory_items (user_id, archived_at, updated_at desc);

create index if not exists coach_checkins_user_date_idx
  on public.coach_checkins (user_id, checkin_date desc);

create index if not exists coach_agent_traces_user_created_idx
  on public.coach_agent_traces (user_id, created_at desc);

create or replace function public.touch_coach_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists athlete_profiles_set_updated_at on public.athlete_profiles;
create trigger athlete_profiles_set_updated_at
before update on public.athlete_profiles
for each row execute function public.touch_coach_updated_at();

drop trigger if exists activity_daily_facts_set_updated_at on public.activity_daily_facts;
create trigger activity_daily_facts_set_updated_at
before update on public.activity_daily_facts
for each row execute function public.touch_coach_updated_at();

drop trigger if exists training_load_daily_set_updated_at on public.training_load_daily;
create trigger training_load_daily_set_updated_at
before update on public.training_load_daily
for each row execute function public.touch_coach_updated_at();

drop trigger if exists coach_threads_set_updated_at on public.coach_threads;
create trigger coach_threads_set_updated_at
before update on public.coach_threads
for each row execute function public.touch_coach_updated_at();

drop trigger if exists coach_memory_items_set_updated_at on public.coach_memory_items;
create trigger coach_memory_items_set_updated_at
before update on public.coach_memory_items
for each row execute function public.touch_coach_updated_at();

alter table public.athlete_profiles enable row level security;
alter table public.activity_daily_facts enable row level security;
alter table public.training_load_daily enable row level security;
alter table public.coach_threads enable row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_memory_items enable row level security;
alter table public.coach_checkins enable row level security;
alter table public.coach_agent_traces enable row level security;

drop policy if exists "Users can manage athlete profiles" on public.athlete_profiles;
create policy "Users can manage athlete profiles"
  on public.athlete_profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage activity daily facts" on public.activity_daily_facts;
create policy "Users can manage activity daily facts"
  on public.activity_daily_facts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage training load daily" on public.training_load_daily;
create policy "Users can manage training load daily"
  on public.training_load_daily
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach threads" on public.coach_threads;
create policy "Users can manage coach threads"
  on public.coach_threads
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach messages" on public.coach_messages;
create policy "Users can manage coach messages"
  on public.coach_messages
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach memory items" on public.coach_memory_items;
create policy "Users can manage coach memory items"
  on public.coach_memory_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach checkins" on public.coach_checkins;
create policy "Users can manage coach checkins"
  on public.coach_checkins
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach agent traces" on public.coach_agent_traces;
create policy "Users can manage coach agent traces"
  on public.coach_agent_traces
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
