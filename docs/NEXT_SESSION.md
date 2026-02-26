# Next Session Handoff (Fresh)

## Where we are now

## Environment variables

**Supabase (required for app + auth):**

- `NEXT_PUBLIC_SUPABASE_URL` — project URL (e.g. `https://<project-ref>.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key (safe for client; RLS enforces security)

**Strava sync (for manual sync / webhook):**

- `STRAVA_SYNC_WEBHOOK_URL` — URL of the sync endpoint to call
- `STRAVA_SYNC_WEBHOOK_TOKEN` — shared secret for the request

**Vercel:** In the project → **Settings → Environment Variables**, add **both** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Apply them to **Production** and **Preview** (and Development if you use Vercel dev). Redeploy after adding or changing vars; existing deployments use the env from when they were built.

**Local dev:** For `npm run dev` on localhost, use a `.env.local` file in the repo root with the same variable names (see `.env.example`). Do not commit `.env.local`.

## Completed

### Product progress
- Dashboard upgraded to an insight-led layout (not just KPI/table)
- Run-type evolution now compares by **distance bands** (e.g. 28–32km)
- Marathon block analysis includes **interactive block explorer**
- July 2025 marathon-distance anomaly is excluded from race-block logic
- Activity detail page now auto-shows:
  - same-category comparison
  - all-history vs last-12-month toggle
  - cache badge (cached vs fresh)

### Data/API progress
- `/api/query` supports:
  - run-specific comparison via `runId`
  - marathon-block pattern query
  - existing weekly/14-day templates
- Added optional cache table SQL:
  - `docs/SUPABASE_RUN_INSIGHT_CACHE.sql`
- Added architecture proposal:
  - `docs/RUN_INSIGHTS_ARCHITECTURE.md`

### Build status
- `npm run build` passes
- lint has only pre-existing warnings in `src/app/layout.tsx`

---

## Priority for next session

## 1) Training Plan persistence (highest remaining gap)
Implement real schema + CRUD (replace placeholder plan page):
- `training_objectives`
- `training_plans`
- `training_plan_workouts`

Then wire `/plan` to real data and actions (create/edit/delete workouts).

## 2) Readiness + Alerts from real calculations
Replace static alert placeholders with computed signals:
- readiness score
- load spike / recovery status
- trend-aware risk flags

## 3) Harden insight caching
- Add cache TTL/invalidation policy
- Add cleanup job for stale cache rows
- Optionally pre-warm cache for latest N runs after sync

## 4) Run detail polish
- Add mini trend chart for selected run vs comparable peers
- Add “best in band / recent median / this run” compact panel

## 5) Query template expansion
Add 6–8 safe templates with chart-ready payloads.

---

## Suggested first commands

```bash
cd /home/monkey/.openclaw/workspace/GRAAFIN
npm run dev
```

Then begin with training plan schema + `/plan` CRUD.
