# GRAAFIN (MVP scaffold)

Web app MVP for Fionnuala's Strava + marathon-plan coaching interface.

## Current status

Implemented:
- Next.js 16 + TypeScript + Tailwind scaffold
- Supabase auth wiring (Google OAuth via Supabase)
- Protected routes with middleware
- Mobile-first cockpit (`/dashboard`) with readiness/load metrics
- GPT coach with persistent memory (`/coach`)
- Trends explorer (`/trends`)
- Strava connection status (data presence + sync status + latest activity)
- Smart Strava sync policy:
  - app-launch background sync with smart throttling
  - fallback daily cron route for 08:00 GST scheduling
  - manual override in Profile advanced controls

## Routes

- `/login` – Google sign-in screen
- `/dashboard` – mobile daily cockpit + quick actions
- `/coach` – persistent AI coach chat
- `/trends` – deep trend exploration
- `/onboarding` – guided setup flow agent
- `/query` – legacy route redirecting to `/coach`
- `/plan` – training plan placeholder
- `/alerts` – readiness/alerts placeholder
- `/profile` – integrations placeholder
- `/api/mobile/cockpit` – compact mobile payload
- `/api/coach/chat` – orchestrated coach response
- `/api/coach/thread` – thread/message history
- `/api/coach/memory` – memory list
- `/api/coach/memory/:id` – memory update/delete
- `/api/coach/checkin` – latest daily check-in
- `/api/jobs/checkin-daily` – service cron route (token required)
- `/api/jobs/strava-sync-daily` – service cron route for daily Strava sync (token required)
- `/api/health` – health check
- `/api/query` – safe template query endpoint
- `/api/sync/trigger` – manual sync trigger endpoint
- `/api/onboarding/state` – onboarding progress state
- `/auth/callback` – OAuth callback

## Quickstart

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Environment variables

See `.env.example` and `docs/SETUP.md`.

## Strava sync contract

See `docs/STRAVA_SYNC_METHODOLOGY.md` for the current Strava/Garmin -> Supabase ingestion contract used by dashboard/query features.
If migrating from a legacy Supabase project, use `docs/SUPABASE_CONSOLIDATION_RUNBOOK.md` and `scripts/migrate-strava-data.mjs`.

## Database setup

To enable `/plan` persistence, run:

- `docs/SUPABASE_TRAINING_PLAN_SCHEMA.sql`
- `docs/SUPABASE_COACH_SCHEMA.sql`

This SQL file creates:

- `training_objectives`
- `training_plans`
- `training_plan_workouts`

It also enables row-level security for authenticated users, adds indexes, and adds `updated_at` triggers.

## Handoff

See `docs/NEXT_SESSION.md` for immediate next tasks.
