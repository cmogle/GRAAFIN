# GRAAFIN (MVP scaffold)

Web app MVP for Fionnuala's Strava + marathon-plan coaching interface.

## Current status

Implemented:
- Next.js 16 + TypeScript + Tailwind scaffold
- Supabase auth wiring (Google OAuth via Supabase)
- Protected routes with middleware
- Dashboard live reads from `strava_activities`
- Safe template-based query API (`/api/query`)
- Strava connection status (data presence + sync status + latest activity)
- Manual sync trigger API/UI (`/api/sync/trigger` + dashboard button)

## Routes

- `/login` – Google sign-in screen
- `/dashboard` – live metrics + sync controls
- `/query` – natural-language query UI
- `/plan` – training plan placeholder
- `/alerts` – readiness/alerts placeholder
- `/profile` – integrations placeholder
- `/api/health` – health check
- `/api/query` – safe template query endpoint
- `/api/sync/trigger` – manual sync trigger endpoint
- `/auth/callback` – OAuth callback

## Quickstart

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Environment variables

See `.env.example` and `docs/SETUP.md`.

## Database setup

To enable `/plan` persistence, run:

- `docs/SUPABASE_TRAINING_PLAN_SCHEMA.sql`

This SQL file creates:

- `training_objectives`
- `training_plans`
- `training_plan_workouts`

It also enables row-level security for authenticated users, adds indexes, and adds `updated_at` triggers.

## Handoff

See `docs/NEXT_SESSION.md` for immediate next tasks.
