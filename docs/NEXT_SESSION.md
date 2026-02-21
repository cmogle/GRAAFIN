# Next Session Handoff

## Completed

- Repo reset to clean slate and archived old code by tag
- Next.js scaffold in place
- Auth plumbing + protected routes
- Live dashboard reads from Supabase
- Query API (safe templates)
- Manual sync trigger button and endpoint
- **Screen design pass applied across core routes**
  - Updated shell/nav visual system
  - Refreshed `/dashboard`, `/query`, `/plan`, `/alerts`, `/profile`
  - Added cleaner cards, spacing, CTA hierarchy, and table styling

## Immediate next priorities

1. **Training plan schema + persistence**
   - Add tables:
     - `training_objectives`
     - `training_plans`
     - `training_plan_workouts`
   - Replace current `/plan` placeholders + sample rows with real CRUD

2. **Readiness + alerts logic**
   - Compute weekly readiness score from Strava + plan
   - Populate `/alerts` from real calculations instead of static examples

3. **Wire real Strava sync endpoint**
   - Build/deploy endpoint in `strava-sync` (or existing service) to accept trigger
   - Configure:
     - `STRAVA_SYNC_WEBHOOK_URL`
     - `STRAVA_SYNC_WEBHOOK_TOKEN`

4. **Query capability expansion**
   - Add 8-10 safe whitelisted templates
   - Return chart-friendly payloads for richer frontend rendering

## Suggested first command in new session

```bash
cd /home/monkey/.openclaw/workspace/GRAAFIN
npm run dev
```

Then move straight into schema + persistence for the Plan page.
