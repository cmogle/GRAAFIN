-- Migration: Add retry queue support for scrape jobs
-- This enables automatic retry of failed scrape jobs with exponential backoff

-- Add retry tracking fields to scrape_jobs
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 3;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS notification_sent boolean DEFAULT false;

-- Index for efficient retry queue queries
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_retry_queue
ON scrape_jobs (status, next_retry_at)
WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Index for finding jobs that need notifications
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_notifications
ON scrape_jobs (status, notification_sent)
WHERE notification_sent = false;
