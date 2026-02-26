create extension if not exists pgcrypto;

create table if not exists public.coach_conversation_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null,
  active_intent text not null default 'other',
  active_goal jsonb not null default '{}'::jsonb,
  active_constraints jsonb not null default '[]'::jsonb,
  unresolved_questions jsonb not null default '[]'::jsonb,
  entity_memory jsonb not null default '{}'::jsonb,
  last_commitments jsonb not null default '[]'::jsonb,
  current_block_phase text,
  availability_state text not null default 'normal',
  running_allowed boolean not null default true,
  expected_return_date date,
  assumptions jsonb not null default '[]'::jsonb,
  memory_applied jsonb not null default '[]'::jsonb,
  state_confidence numeric(5, 2) not null default 0.60,
  updated_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, thread_id),
  constraint coach_conversation_state_availability_check
    check (availability_state in ('normal', 'injury_adaptation', 'medical_hold', 'return_build')),
  constraint coach_conversation_state_confidence_check
    check (state_confidence >= 0 and state_confidence <= 1)
);

create table if not exists public.athlete_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade unique,
  availability_state text not null default 'normal',
  running_allowed boolean not null default true,
  expected_return_date date,
  last_medical_note text,
  symptoms jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  confidence numeric(5, 2) not null default 0.60,
  source text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_state_availability_check
    check (availability_state in ('normal', 'injury_adaptation', 'medical_hold', 'return_build')),
  constraint athlete_state_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create table if not exists public.race_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  race_name text not null,
  race_date date,
  target_finish_seconds integer,
  source text not null default 'system',
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint race_targets_source_check
    check (source in ('objective', 'manual', 'system')),
  constraint race_targets_target_finish_seconds_check
    check (target_finish_seconds is null or target_finish_seconds > 0)
);

create unique index if not exists race_targets_user_name_date_unique
  on public.race_targets (user_id, race_name, race_date);

create table if not exists public.marathon_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  block_key text not null,
  race_name text not null,
  race_date date not null,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  source text not null default 'auto',
  summary jsonb not null default '{}'::jsonb,
  confidence numeric(5, 2) not null default 0.70,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, block_key),
  constraint marathon_blocks_source_check
    check (source in ('auto', 'manual', 'objective')),
  constraint marathon_blocks_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create table if not exists public.block_week_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  block_id uuid not null references public.marathon_blocks (id) on delete cascade,
  week_index integer not null,
  week_start date,
  distance_km numeric(8, 2),
  long_run_km numeric(7, 2),
  quality_sessions integer,
  load_score numeric(10, 3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, week_index)
);

create table if not exists public.availability_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  constraint_type text not null,
  details jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  confidence numeric(5, 2) not null default 0.60,
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_constraints_type_check
    check (constraint_type in ('time', 'medical', 'logistics', 'preference', 'other')),
  constraint availability_constraints_source_check
    check (source in ('user', 'system', 'coach')),
  constraint availability_constraints_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create table if not exists public.coach_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid,
  commitment text not null,
  status text not null default 'open',
  due_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_commitments_status_check
    check (status in ('open', 'done', 'cancelled'))
);

create table if not exists public.coach_evidence_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  url text not null,
  domain text not null,
  topic_tags text[] not null default '{}',
  evidence_grade text not null default 'B',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_evidence_sources_grade_check
    check (evidence_grade in ('A', 'B', 'C'))
);

create table if not exists public.coach_evidence_snippets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  source_id uuid not null references public.coach_evidence_sources (id) on delete cascade,
  topic text not null,
  claim text not null,
  snippet text not null,
  url text,
  published_at date,
  retrieved_at timestamptz not null default now(),
  fresh_until timestamptz,
  confidence numeric(5, 2) not null default 0.70,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_evidence_snippets_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists coach_conversation_state_user_thread_idx
  on public.coach_conversation_state (user_id, thread_id);

create index if not exists coach_conversation_state_user_updated_idx
  on public.coach_conversation_state (user_id, updated_at desc);

create index if not exists race_targets_user_primary_idx
  on public.race_targets (user_id, is_primary, race_date desc);

create unique index if not exists race_targets_user_primary_unique
  on public.race_targets (user_id)
  where is_primary;

create index if not exists marathon_blocks_user_race_idx
  on public.marathon_blocks (user_id, race_date desc);

create index if not exists marathon_blocks_user_active_idx
  on public.marathon_blocks (user_id, is_active, updated_at desc);

create index if not exists block_week_metrics_block_week_idx
  on public.block_week_metrics (block_id, week_index);

create index if not exists availability_constraints_user_active_idx
  on public.availability_constraints (user_id, is_active, updated_at desc);

create index if not exists coach_commitments_user_status_idx
  on public.coach_commitments (user_id, status, created_at desc);

create index if not exists coach_evidence_snippets_topic_idx
  on public.coach_evidence_snippets (topic, fresh_until desc);

create index if not exists coach_evidence_snippets_user_topic_idx
  on public.coach_evidence_snippets (user_id, topic, fresh_until desc);

create or replace function public.touch_coach_intelligence_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists coach_conversation_state_set_updated_at on public.coach_conversation_state;
create trigger coach_conversation_state_set_updated_at
before update on public.coach_conversation_state
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists athlete_state_set_updated_at on public.athlete_state;
create trigger athlete_state_set_updated_at
before update on public.athlete_state
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists race_targets_set_updated_at on public.race_targets;
create trigger race_targets_set_updated_at
before update on public.race_targets
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists marathon_blocks_set_updated_at on public.marathon_blocks;
create trigger marathon_blocks_set_updated_at
before update on public.marathon_blocks
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists block_week_metrics_set_updated_at on public.block_week_metrics;
create trigger block_week_metrics_set_updated_at
before update on public.block_week_metrics
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists availability_constraints_set_updated_at on public.availability_constraints;
create trigger availability_constraints_set_updated_at
before update on public.availability_constraints
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists coach_commitments_set_updated_at on public.coach_commitments;
create trigger coach_commitments_set_updated_at
before update on public.coach_commitments
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists coach_evidence_sources_set_updated_at on public.coach_evidence_sources;
create trigger coach_evidence_sources_set_updated_at
before update on public.coach_evidence_sources
for each row execute function public.touch_coach_intelligence_updated_at();

drop trigger if exists coach_evidence_snippets_set_updated_at on public.coach_evidence_snippets;
create trigger coach_evidence_snippets_set_updated_at
before update on public.coach_evidence_snippets
for each row execute function public.touch_coach_intelligence_updated_at();

alter table public.coach_conversation_state enable row level security;
alter table public.athlete_state enable row level security;
alter table public.race_targets enable row level security;
alter table public.marathon_blocks enable row level security;
alter table public.block_week_metrics enable row level security;
alter table public.availability_constraints enable row level security;
alter table public.coach_commitments enable row level security;
alter table public.coach_evidence_sources enable row level security;
alter table public.coach_evidence_snippets enable row level security;

drop policy if exists "Users can manage coach conversation state" on public.coach_conversation_state;
create policy "Users can manage coach conversation state"
  on public.coach_conversation_state
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage athlete state" on public.athlete_state;
create policy "Users can manage athlete state"
  on public.athlete_state
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage race targets" on public.race_targets;
create policy "Users can manage race targets"
  on public.race_targets
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage marathon blocks" on public.marathon_blocks;
create policy "Users can manage marathon blocks"
  on public.marathon_blocks
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage block week metrics" on public.block_week_metrics;
create policy "Users can manage block week metrics"
  on public.block_week_metrics
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage availability constraints" on public.availability_constraints;
create policy "Users can manage availability constraints"
  on public.availability_constraints
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach commitments" on public.coach_commitments;
create policy "Users can manage coach commitments"
  on public.coach_commitments
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read active coach evidence sources" on public.coach_evidence_sources;
create policy "Authenticated users can read active coach evidence sources"
  on public.coach_evidence_sources
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "Authenticated users can read coach evidence snippets" on public.coach_evidence_snippets;
create policy "Authenticated users can read coach evidence snippets"
  on public.coach_evidence_snippets
  for select
  to authenticated
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can manage personal coach evidence snippets" on public.coach_evidence_snippets;
create policy "Users can manage personal coach evidence snippets"
  on public.coach_evidence_snippets
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into public.coach_evidence_sources (slug, title, url, domain, topic_tags, evidence_grade, is_active)
values
  (
    'acsm-endurance',
    'ACSM Position Stand on Endurance Training',
    'https://www.acsm.org/',
    'acsm.org',
    '{training-load,injury-prevention,endurance}',
    'A',
    true
  ),
  (
    'world-athletics-road',
    'World Athletics Road Running Guidance',
    'https://worldathletics.org/',
    'worldathletics.org',
    '{marathon,strategy,competition}',
    'A',
    true
  ),
  (
    'strava-engineering',
    'Strava Data Insights',
    'https://stories.strava.com/',
    'stories.strava.com',
    '{training-patterns,community,load}',
    'B',
    true
  )
on conflict (slug) do update
set
  title = excluded.title,
  url = excluded.url,
  domain = excluded.domain,
  topic_tags = excluded.topic_tags,
  evidence_grade = excluded.evidence_grade,
  is_active = excluded.is_active,
  updated_at = now();
