# Next Session Handoff

## Completed

- Repo reset to clean slate and archived old code by tag
- Next.js scaffold in place
- Auth plumbing + protected routes
- Live dashboard reads from Supabase
- Query API (safe templates)
- Manual sync trigger button and endpoint

## Immediate next priorities

1. **Wire real Strava sync endpoint**
   - Build/deploy endpoint in `strava-sync` (or existing service) to accept trigger
   - Configure:
     - `STRAVA_SYNC_WEBHOOK_URL`
     - `STRAVA_SYNC_WEBHOOK_TOKEN`

2. **Screen design pass (high priority)**
   - Use v0 prompts already prepared in prior session
   - Export component/layout decisions
   - Apply to routes:
     - `/dashboard`
     - `/query`
     - `/plan`
     - `/alerts`
     - `/profile`

3. **Training plan schema + persistence**
   - Add tables:
     - `training_objectives`
     - `training_plans`
     - `training_plan_workouts`
   - Replace placeholders in `/plan`

4. **Readiness + alerts logic**
   - Compute weekly readiness score from Strava + plan
   - Populate `/alerts` from real calculations

5. **Query capability expansion**
   - Add 8-10 safe whitelisted templates
   - Return chart-friendly payloads

## Suggested first command in new session

```bash
cd /home/monkey/.openclaw/workspace/GRAAFIN
npm run dev
```

Then start with design implementation using v0-generated components.
