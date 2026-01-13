import {
  getJobsForRetry,
  scheduleJobRetry,
  resetJobForRetry,
  updateScrapeJob,
  getEventByUrl,
  saveEvent,
  saveResults,
  type ScrapeJob,
} from '../storage/supabase.js';
import { getScraperForUrl, getScraperByOrganiser } from '../scraper/index.js';
import type { ScrapedResults } from '../scraper/organisers/base.js';
import {
  notifyScrapeJobRetrySuccess,
  notifyScrapeJobFailed,
  notifyScrapeJobPermanentFailure,
} from '../notifications/scrape-notifications.js';

/**
 * Exponential backoff intervals in milliseconds
 * Retry 1: 5 minutes
 * Retry 2: 15 minutes
 * Retry 3: 45 minutes
 */
const RETRY_INTERVALS_MS = [
  5 * 60 * 1000,   // 5 minutes
  15 * 60 * 1000,  // 15 minutes
  45 * 60 * 1000,  // 45 minutes
];

/**
 * Schedule a job for retry with exponential backoff
 */
export async function scheduleRetry(jobId: string, currentRetryCount: number): Promise<void> {
  const nextRetryCount = currentRetryCount + 1;

  if (nextRetryCount > RETRY_INTERVALS_MS.length) {
    console.log(`[RetryQueue] Job ${jobId} has exceeded max retries (${RETRY_INTERVALS_MS.length})`);
    return;
  }

  const intervalMs = RETRY_INTERVALS_MS[currentRetryCount] || RETRY_INTERVALS_MS[RETRY_INTERVALS_MS.length - 1];
  const nextRetryAt = new Date(Date.now() + intervalMs);

  console.log(`[RetryQueue] Scheduling retry ${nextRetryCount} for job ${jobId} at ${nextRetryAt.toISOString()}`);

  await scheduleJobRetry(jobId, nextRetryAt, nextRetryCount);
}

/**
 * Process a single retry job
 */
async function processRetryJob(job: ScrapeJob): Promise<void> {
  const jobId = job.id;
  const attemptNumber = (job.retry_count || 0) + 1;

  console.log(`[RetryQueue] Processing retry attempt ${attemptNumber} for job ${jobId}`);

  try {
    // Reset job status to running
    await resetJobForRetry(jobId);

    // Get the appropriate scraper
    let scraper = (job.organiser && job.organiser !== 'unknown')
      ? getScraperByOrganiser(job.organiser)
      : null;

    if (!scraper) {
      scraper = getScraperForUrl(job.event_url);
    }

    if (!scraper) {
      throw new Error(`No scraper available for URL: ${job.event_url}`);
    }

    // Check if event already exists
    let eventId: string;
    let eventName: string | undefined;
    const existingEvent = await getEventByUrl(job.event_url);

    if (existingEvent) {
      eventId = existingEvent.id;
      eventName = existingEvent.event_name;
      console.log(`[RetryQueue] Job ${jobId}: Event already exists: ${eventId}`);
    } else {
      // Scrape the event
      console.log(`[RetryQueue] Job ${jobId}: Scraping event: ${job.event_url}`);
      const scrapedData: ScrapedResults = await scraper.scrapeEvent(job.event_url);
      eventName = scrapedData.event.eventName;

      // Save the event
      eventId = await saveEvent({
        organiser: scrapedData.event.organiser,
        eventName: scrapedData.event.eventName,
        eventDate: scrapedData.event.eventDate,
        eventUrl: scrapedData.event.eventUrl,
        distance: scrapedData.event.distance,
        location: scrapedData.event.location,
        metadata: scrapedData.event.metadata,
      });

      console.log(`[RetryQueue] Job ${jobId}: Event saved: ${eventId}`);

      // Save results if we have them
      if (scrapedData.results.length > 0) {
        const distance = scrapedData.event.distance || 'Unknown';
        await saveResults(eventId, scrapedData.results, distance);
        console.log(`[RetryQueue] Job ${jobId}: Saved ${scrapedData.results.length} results`);
      }
    }

    // Get result count for notification
    let resultsCount = 0;
    if (!existingEvent) {
      const scrapedData: ScrapedResults = await scraper.scrapeEvent(job.event_url);
      resultsCount = scrapedData.results.length;
    }

    // Update job as completed
    await updateScrapeJob(jobId, {
      status: 'completed',
      resultsCount,
    });

    console.log(`[RetryQueue] Job ${jobId}: Retry attempt ${attemptNumber} succeeded!`);

    // Send success notification
    await notifyScrapeJobRetrySuccess(job, resultsCount, attemptNumber, eventName);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[RetryQueue] Job ${jobId}: Retry attempt ${attemptNumber} failed: ${errorMessage}`);

    // Update job as failed
    await updateScrapeJob(jobId, {
      status: 'failed',
      errorMessage,
    });

    // Check if we should schedule another retry
    const currentRetryCount = job.retry_count || 0;
    const willRetry = currentRetryCount < RETRY_INTERVALS_MS.length - 1;

    if (willRetry) {
      // Schedule next retry
      await scheduleRetry(jobId, currentRetryCount);
      await notifyScrapeJobFailed(job, errorMessage, true, currentRetryCount + 1);
    } else {
      // Max retries exhausted - send permanent failure notification
      console.log(`[RetryQueue] Job ${jobId}: All retry attempts exhausted`);
      await notifyScrapeJobPermanentFailure(job, errorMessage);
    }
  }
}

/**
 * Process the retry queue
 * Called periodically by the scheduler
 */
export async function processRetryQueue(): Promise<void> {
  console.log('[RetryQueue] Checking for jobs due for retry...');

  try {
    const jobsToRetry = await getJobsForRetry();

    if (jobsToRetry.length === 0) {
      console.log('[RetryQueue] No jobs due for retry');
      return;
    }

    console.log(`[RetryQueue] Found ${jobsToRetry.length} job(s) due for retry`);

    // Process jobs sequentially to avoid overwhelming external services
    for (const job of jobsToRetry) {
      await processRetryJob(job);

      // Add a small delay between jobs to be polite to external services
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('[RetryQueue] Finished processing retry queue');
  } catch (error) {
    console.error('[RetryQueue] Error processing retry queue:', error);
  }
}
