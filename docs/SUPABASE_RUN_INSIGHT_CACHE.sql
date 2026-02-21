-- Optional cache table for per-run insight payloads
-- Safe to run once in Supabase SQL editor

create table if not exists public.run_insight_cache (
  run_id text not null,
  insight_type text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (run_id, insight_type)
);

create index if not exists run_insight_cache_updated_idx
  on public.run_insight_cache(updated_at desc);

-- Optional cleanup policy (manual):
-- delete from public.run_insight_cache where updated_at < now() - interval '30 days';
