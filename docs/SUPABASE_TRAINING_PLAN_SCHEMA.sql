-- Training plan persistence for /plan
-- Run this in the Supabase SQL editor (idempotent and RLS-secured)

create extension if not exists pgcrypto;

create table if not exists public.training_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_race_name text not null,
  goal_race_date date,
  target_finish_seconds integer,
  target_weekly_volume_km numeric(7, 2),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_objectives_target_finish_seconds_check
    check (target_finish_seconds is null or target_finish_seconds > 0),
  constraint training_objectives_target_weekly_volume_km_check
    check (target_weekly_volume_km is null or target_weekly_volume_km >= 0)
);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  objective_id uuid references public.training_objectives (id) on delete set null,
  plan_name text not null,
  plan_week_start date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_plan_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.training_plans (id) on delete cascade,
  day_of_week smallint not null,
  workout_order integer not null default 0,
  workout_name text not null,
  workout_distance_km numeric(7,2),
  workout_duration_min integer,
  workout_notes text,
  workout_status text not null default 'Planned',
  workout_type text,
  workout_intensity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_plan_workouts_day_of_week_check
    check (day_of_week between 0 and 6),
  constraint training_plan_workouts_distance_km_check
    check (workout_distance_km is null or workout_distance_km >= 0),
  constraint training_plan_workouts_duration_min_check
    check (workout_duration_min is null or workout_duration_min > 0),
  constraint training_plan_workouts_workout_status_check
    check (lower(workout_status) in ('planned', 'complete', 'missed')),
  constraint training_plan_workouts_workout_intensity_check
    check (
      workout_intensity is null or lower(workout_intensity) in (
        'easy',
        'steady',
        'tempo',
        'threshold',
        'interval',
        'long'
      )
    )
);

create index if not exists training_objectives_user_created_idx
  on public.training_objectives (user_id, created_at desc);

create unique index if not exists training_objectives_user_active_idx
  on public.training_objectives (user_id)
  where is_active;

create index if not exists training_plans_user_created_idx
  on public.training_plans (user_id, created_at desc);

create index if not exists training_plans_user_objective_idx
  on public.training_plans (user_id, objective_id);

create unique index if not exists training_plans_user_active_idx
  on public.training_plans (user_id)
  where is_active;

create index if not exists training_plan_workouts_plan_created_idx
  on public.training_plan_workouts (plan_id, created_at desc);

create index if not exists training_plan_workouts_plan_day_idx
  on public.training_plan_workouts (plan_id, day_of_week, workout_order, created_at);

create or replace function public.touch_training_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists training_objectives_set_updated_at on public.training_objectives;
create trigger training_objectives_set_updated_at
before update on public.training_objectives
for each row
execute function public.touch_training_updated_at();

drop trigger if exists training_plans_set_updated_at on public.training_plans;
create trigger training_plans_set_updated_at
before update on public.training_plans
for each row
execute function public.touch_training_updated_at();

drop trigger if exists training_plan_workouts_set_updated_at on public.training_plan_workouts;
create trigger training_plan_workouts_set_updated_at
before update on public.training_plan_workouts
for each row
execute function public.touch_training_updated_at();

alter table public.training_objectives enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_plan_workouts enable row level security;

drop policy if exists "Users can manage training objectives" on public.training_objectives;
create policy "Users can manage training objectives"
  on public.training_objectives
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage training plans" on public.training_plans;
create policy "Users can manage training plans"
  on public.training_plans
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage training plan workouts" on public.training_plan_workouts;
create policy "Users can manage training plan workouts"
  on public.training_plan_workouts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
