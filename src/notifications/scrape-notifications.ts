import { sendNotification, isTwilioConfigured, type TwilioConfig } from './index.js';
import type { ScrapeJob } from '../storage/supabase.js';

/**
 * Get Twilio configuration from environment
 */
function getTwilioConfig(): { twilio: TwilioConfig; notifyWhatsapp: string } {
  return {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    },
    notifyWhatsapp: process.env.NOTIFY_WHATSAPP || '',
  };
}

/**
 * Check if notifications are configured
 */
export function isNotificationConfigured(): boolean {
  const config = getTwilioConfig();
  return isTwilioConfigured(config.twilio) && !!config.notifyWhatsapp;
}

/**
 * Send notification when scrape job completes successfully
 */
export async function notifyScrapeJobComplete(
  job: ScrapeJob,
  resultsCount: number,
  eventName?: string
): Promise<boolean> {
  const config = getTwilioConfig();

  if (!isNotificationConfigured()) {
    console.log('[Notifications] Twilio not configured, skipping scrape completion notification');
    return false;
  }

  const message = `SCRAPE COMPLETE

Event: ${eventName || 'Unknown Event'}
URL: ${job.event_url}
Results: ${resultsCount}
Job ID: ${job.id.slice(0, 8)}...`;

  console.log(`[Notifications] Sending scrape completion notification for job ${job.id}`);
  return sendNotification(config, message);
}

/**
 * Send notification when scrape job fails
 */
export async function notifyScrapeJobFailed(
  job: ScrapeJob,
  error: string,
  willRetry: boolean,
  retryCount: number = 0
): Promise<boolean> {
  const config = getTwilioConfig();

  if (!isNotificationConfigured()) {
    console.log('[Notifications] Twilio not configured, skipping scrape failure notification');
    return false;
  }

  const retryInfo = willRetry
    ? `Yes (attempt ${retryCount + 1}/3)`
    : 'No (max retries reached)';

  // Truncate error message if too long
  const truncatedError = error.length > 100 ? error.slice(0, 100) + '...' : error;

  const message = `SCRAPE FAILED

URL: ${job.event_url}
Error: ${truncatedError}
Retry: ${retryInfo}
Job ID: ${job.id.slice(0, 8)}...`;

  console.log(`[Notifications] Sending scrape failure notification for job ${job.id}`);
  return sendNotification(config, message);
}

/**
 * Send notification when a retry succeeds
 */
export async function notifyScrapeJobRetrySuccess(
  job: ScrapeJob,
  resultsCount: number,
  attemptNumber: number,
  eventName?: string
): Promise<boolean> {
  const config = getTwilioConfig();

  if (!isNotificationConfigured()) {
    console.log('[Notifications] Twilio not configured, skipping retry success notification');
    return false;
  }

  const message = `SCRAPE RETRY SUCCESS

Event: ${eventName || 'Unknown Event'}
URL: ${job.event_url}
Results: ${resultsCount}
Attempts: ${attemptNumber}/3
Job ID: ${job.id.slice(0, 8)}...`;

  console.log(`[Notifications] Sending retry success notification for job ${job.id}`);
  return sendNotification(config, message);
}

/**
 * Send notification when all retries have been exhausted
 */
export async function notifyScrapeJobPermanentFailure(
  job: ScrapeJob,
  error: string
): Promise<boolean> {
  const config = getTwilioConfig();

  if (!isNotificationConfigured()) {
    console.log('[Notifications] Twilio not configured, skipping permanent failure notification');
    return false;
  }

  // Truncate error message if too long
  const truncatedError = error.length > 100 ? error.slice(0, 100) + '...' : error;

  const message = `SCRAPE PERMANENTLY FAILED

URL: ${job.event_url}
Error: ${truncatedError}
Attempts: 3/3 exhausted
Action: Manual intervention required
Job ID: ${job.id.slice(0, 8)}...`;

  console.log(`[Notifications] Sending permanent failure notification for job ${job.id}`);
  return sendNotification(config, message);
}
