# Migration from Render to GRAAFIN

This guide documents the migration of monitoring functionality from the previous Render deployment to GRAAFIN (Athlete Performance Platform).

## Overview

GRAAFIN now includes integrated endpoint monitoring capabilities. The old Render deployment can be shut down once monitoring is verified to be working in GRAAFIN.

## Pre-Migration Checklist

- [ ] GRAAFIN server is running and accessible
- [ ] Supabase database migrations are complete (including `003_monitoring_schema.sql`)
- [ ] Admin API key is configured
- [ ] Monitoring endpoints can be added via admin UI
- [ ] Quick test functionality works
- [ ] Manual endpoint checks work

## Migration Steps

### Step 1: Run Monitoring Schema Migration

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `src/db/migrations/003_monitoring_schema.sql`
3. Run the migration
4. Verify tables were created:
   - `monitored_endpoints`
   - `endpoint_status_history`
   - `endpoint_status_current`

### Step 2: Add Default Monitored Endpoints

Add the endpoints that were being monitored in Render. You can do this via:

**Option A: Admin UI**
1. Go to `http://localhost:3000` (or your GRAAFIN URL)
2. Navigate to Admin page
3. Enter your Admin API key
4. Use "Add Endpoint to Monitor" form to add:
   - Hopasports - Marina Home 2026
   - Hopasports - Plus500 2025
   - Any other endpoints you were monitoring

**Option B: SQL (Bulk Insert)**

Run this SQL in Supabase to add default endpoints:

```sql
INSERT INTO monitored_endpoints (organiser, endpoint_url, name, enabled, check_interval_minutes)
VALUES
  ('hopasports', 'https://results.hopasports.com/event/marina-home-dubai-creek-striders-half-marathon-10km-2026', 'Hopasports - Marina Home 2026', true, 5),
  ('hopasports', 'https://results.hopasports.com/event/plus500-city-half-marathon-dubai-2025', 'Hopasports - Plus500 2025', true, 5)
ON CONFLICT (organiser, endpoint_url) DO NOTHING;
```

### Step 3: Test Monitoring in GRAAFIN

1. **Test Quick Check:**
   ```bash
   curl -X POST http://localhost:3000/api/admin/monitoring/quick-check \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_ADMIN_KEY" \
     -d '{"url": "https://results.hopasports.com/event/test-event"}'
   ```

2. **Test Manual Check:**
   - Use admin UI to add an endpoint
   - Click "Check Now" button
   - Verify status is saved correctly

3. **Verify Status History:**
   - Check that status history is being recorded
   - Verify current status is updated

### Step 4: Export Render Monitoring State (Optional)

If you want to preserve historical monitoring data from Render:

1. The old monitoring state was stored in filesystem/S3
2. If you have access to that data, you could:
   - Export the state JSON
   - Manually insert into `endpoint_status_history` if needed
   - For MVP, this is optional - fresh start is fine

### Step 5: Verify GRAAFIN Monitoring

1. **Check endpoints are listed:**
   ```bash
   curl http://localhost:3000/api/admin/monitoring/endpoints \
     -H "X-API-Key: YOUR_ADMIN_KEY"
   ```

2. **Manually trigger a check:**
   ```bash
   curl -X POST http://localhost:3000/api/admin/monitoring/check/ENDPOINT_ID \
     -H "X-API-Key: YOUR_ADMIN_KEY"
   ```

3. **Verify status is saved:**
   ```bash
   curl http://localhost:3000/api/admin/monitoring/status/ENDPOINT_ID \
     -H "X-API-Key: YOUR_ADMIN_KEY"
   ```

### Step 6: Shut Down Render Deployment

Once GRAAFIN monitoring is verified:

1. **Stop Render services:**
   - Go to Render Dashboard
   - Stop the web service
   - Stop the cron job
   - Optionally delete the services

2. **Clean up (optional):**
   - Remove Render environment variables
   - Archive Render deployment if needed

## Optional: Enable Background Monitoring

For MVP, monitoring is manual only. To enable automatic background monitoring:

1. **Start the scheduler in server.ts:**
   ```typescript
   import { startMonitoringScheduler } from './monitoring/scheduler.js';
   
   // After server starts
   if (process.env.ENABLE_BACKGROUND_MONITORING === 'true') {
     startMonitoringScheduler();
   }
   ```

2. **Set environment variable:**
   ```bash
   ENABLE_BACKGROUND_MONITORING=true
   ```

3. **Or run as separate process:**
   - Create a separate script that runs the scheduler
   - Use a cron job or scheduled task to run it

## Differences from Render Deployment

### Old (Render):
- Single endpoint monitoring (hardcoded URL)
- Filesystem/S3 storage for state
- Automatic cron-based checks
- Twilio notifications on status change

### New (GRAAFIN):
- Multiple endpoints support
- Supabase storage for state and history
- Manual checks via admin UI (MVP)
- Optional background scheduler
- No notifications in MVP (can be added later)

## Testing Checklist

- [ ] Can add endpoint via admin UI
- [ ] Can test endpoint without saving (quick check)
- [ ] Can manually check endpoint
- [ ] Status is saved to database
- [ ] Status history is recorded
- [ ] Can view current status
- [ ] Can view status history
- [ ] Can delete endpoint
- [ ] Multiple endpoints can be monitored

## Rollback Plan

If issues arise:

1. Keep Render deployment running until GRAAFIN is fully verified
2. Monitor both systems in parallel initially
3. Only shut down Render after 24-48 hours of successful GRAAFIN operation

## Post-Migration

After successful migration:

1. Update documentation to reflect GRAAFIN monitoring
2. Remove old Render deployment references
3. Update any external integrations that relied on Render endpoints
4. Consider enabling background monitoring if needed

## Notes

- **MVP Scope:** Manual monitoring only - no automatic background checks
- **Future Enhancements:** Can add automatic scheduling, notifications, etc.
- **Data Migration:** Historical data from Render is optional - fresh start is fine for MVP
