create extension if not exists pgcrypto;

create table if not exists public.coach_learning_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  allow_global_learning boolean not null default false,
  allow_raw_retention boolean not null default true,
  raw_retention_days integer not null default 365,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_learning_preferences_retention_days_check
    check (raw_retention_days >= 0 and raw_retention_days <= 3650)
);

create table if not exists public.coach_query_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid references public.coach_threads (id) on delete set null,
  user_message_id uuid references public.coach_messages (id) on delete set null,
  assistant_message_id uuid references public.coach_messages (id) on delete set null,
  query_text text,
  assistant_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  season_phase text not null,
  global_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  constraint coach_query_events_season_phase_check
    check (season_phase in ('base', 'build', 'peak', 'taper', 'race_week', 'recovery'))
);

create unique index if not exists coach_query_events_user_message_unique
  on public.coach_query_events (user_message_id)
  where user_message_id is not null;

create index if not exists coach_query_events_user_created_idx
  on public.coach_query_events (user_id, created_at desc);

create index if not exists coach_query_events_user_season_created_idx
  on public.coach_query_events (user_id, season_phase, created_at desc);

create index if not exists coach_query_events_global_created_idx
  on public.coach_query_events (global_eligible, created_at desc);

create table if not exists public.coach_query_features (
  event_id uuid primary key references public.coach_query_events (id) on delete cascade,
  intent text not null,
  query_route text not null,
  topics text[] not null default '{}',
  constraints text[] not null default '{}',
  risk_flags text[] not null default '{}',
  novelty_score numeric(5, 2) not null default 0,
  confidence numeric(5, 2) not null default 0,
  module_candidates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint coach_query_features_novelty_check
    check (novelty_score >= 0 and novelty_score <= 1),
  constraint coach_query_features_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists coach_query_features_intent_created_idx
  on public.coach_query_features (intent, created_at desc);

create table if not exists public.athlete_workbench_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  surface text not null,
  module_key text not null,
  slot_index integer not null,
  visibility text not null default 'auto',
  pinned boolean not null default false,
  score numeric(6, 3) not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, surface, module_key),
  constraint athlete_workbench_layouts_surface_check
    check (surface in ('coach', 'dashboard')),
  constraint athlete_workbench_layouts_visibility_check
    check (visibility in ('auto', 'manual_shown', 'manual_hidden'))
);

create index if not exists athlete_workbench_layouts_user_surface_slot_idx
  on public.athlete_workbench_layouts (user_id, surface, slot_index);

create table if not exists public.coach_feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid references public.coach_query_events (id) on delete set null,
  feedback_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint coach_feedback_events_type_check
    check (feedback_type in ('thumb_up', 'thumb_down', 'module_open', 'module_hide'))
);

create index if not exists coach_feedback_events_user_created_idx
  on public.coach_feedback_events (user_id, created_at desc);

create table if not exists public.coach_global_query_patterns (
  week_start date not null,
  intent text not null,
  season_phase text not null,
  pattern_key text not null,
  query_count integer not null,
  athlete_count integer not null,
  low_confidence_rate numeric(5, 2) not null,
  unresolved_rate numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  primary key (week_start, intent, season_phase, pattern_key),
  constraint coach_global_query_patterns_query_count_check check (query_count >= 0),
  constraint coach_global_query_patterns_athlete_count_check check (athlete_count >= 0),
  constraint coach_global_query_patterns_low_confidence_rate_check check (low_confidence_rate >= 0 and low_confidence_rate <= 1),
  constraint coach_global_query_patterns_unresolved_rate_check check (unresolved_rate >= 0 and unresolved_rate <= 1),
  constraint coach_global_query_patterns_season_phase_check
    check (season_phase in ('base', 'build', 'peak', 'taper', 'race_week', 'recovery'))
);

create or replace function public.touch_coach_learning_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists coach_learning_preferences_set_updated_at on public.coach_learning_preferences;
create trigger coach_learning_preferences_set_updated_at
before update on public.coach_learning_preferences
for each row execute function public.touch_coach_learning_updated_at();

drop trigger if exists athlete_workbench_layouts_set_updated_at on public.athlete_workbench_layouts;
create trigger athlete_workbench_layouts_set_updated_at
before update on public.athlete_workbench_layouts
for each row execute function public.touch_coach_learning_updated_at();

create or replace function public.prune_coach_query_raw_text()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_affected integer := 0;
  local_count integer := 0;
begin
  update public.coach_query_events e
    set query_text = null
  from public.coach_learning_preferences p
  where e.user_id = p.user_id
    and e.query_text is not null
    and (
      p.allow_raw_retention = false
      or e.created_at < now() - make_interval(days => p.raw_retention_days)
    );

  get diagnostics local_count = row_count;
  rows_affected := rows_affected + local_count;

  update public.coach_query_events e
    set query_text = null
  where e.query_text is not null
    and not exists (
      select 1 from public.coach_learning_preferences p
      where p.user_id = e.user_id
    )
    and e.created_at < now() - interval '365 days';

  get diagnostics local_count = row_count;
  rows_affected := rows_affected + local_count;
  return rows_affected;
end;
$$;

alter table public.coach_learning_preferences enable row level security;
alter table public.coach_query_events enable row level security;
alter table public.coach_query_features enable row level security;
alter table public.athlete_workbench_layouts enable row level security;
alter table public.coach_feedback_events enable row level security;
alter table public.coach_global_query_patterns enable row level security;

drop policy if exists "Users can manage coach learning preferences" on public.coach_learning_preferences;
create policy "Users can manage coach learning preferences"
  on public.coach_learning_preferences
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach query events" on public.coach_query_events;
create policy "Users can manage coach query events"
  on public.coach_query_events
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach query features" on public.coach_query_features;
create policy "Users can manage coach query features"
  on public.coach_query_features
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.coach_query_events e
      where e.id = event_id
        and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.coach_query_events e
      where e.id = event_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage athlete workbench layouts" on public.athlete_workbench_layouts;
create policy "Users can manage athlete workbench layouts"
  on public.athlete_workbench_layouts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage coach feedback events" on public.coach_feedback_events;
create policy "Users can manage coach feedback events"
  on public.coach_feedback_events
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read global coach patterns" on public.coach_global_query_patterns;
create policy "Authenticated users can read global coach patterns"
  on public.coach_global_query_patterns
  for select
  to authenticated
  using (true);
