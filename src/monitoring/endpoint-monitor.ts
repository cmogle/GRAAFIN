import axios from 'axios';
import * as cheerio from 'cheerio';
import type { SiteStatus, MonitorResult } from './types.js';
import {
  saveEndpointStatus,
  getEndpointStatus,
  type MonitoredEndpoint,
} from '../storage/monitoring.js';

// Extract the results API URL from the main page
function extractResultsApiUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const resultsComponent = $('#results_container results');
  if (resultsComponent.length === 0) return null;

  const resultsUrl = resultsComponent.attr('results_url');
  const racesAttr = resultsComponent.attr(':races_with_pt');

  if (!resultsUrl || !racesAttr) return null;

  try {
    const jsonMatch = racesAttr.match(/JSON\.parse\('(.+)'\)/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1]
        .replace(/\\u0022/g, '"')
        .replace(/\\\//g, '/');
      const races = JSON.parse(jsonStr);
      if (races.length > 0) {
        const firstRace = races[0];
        return `${resultsUrl}?race_id=${firstRace.race_id}&pt=${firstRace.pt}`;
      }
    }
  } catch {
    // Failed to parse
  }

  return null;
}

/**
 * Check the status of an endpoint
 */
export async function checkSiteStatus(url: string): Promise<SiteStatus> {
  const startTime = Date.now();

  try {
    // First, fetch the main page
    const pageResponse = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'GRAAFIN/2.0 (Athlete Performance Platform)',
      },
    });

    // If main page fails, report that
    if (pageResponse.status >= 400) {
      const responseTime = Date.now() - startTime;
      return {
        isUp: false,
        statusCode: pageResponse.status,
        responseTime,
        hasResults: false,
        error: `Main page returned HTTP ${pageResponse.status}`,
      };
    }

    // Extract the results API URL
    const apiUrl = extractResultsApiUrl(pageResponse.data);

    if (!apiUrl) {
      // Page loads but no results API configured yet
      const responseTime = Date.now() - startTime;
      return {
        isUp: true,
        statusCode: 200,
        responseTime,
        hasResults: false,
      };
    }

    // Now check the actual results API
    const apiResponse = await axios.get(apiUrl, {
      timeout: 30000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'GRAAFIN/2.0 (Athlete Performance Platform)',
      },
    });

    const responseTime = Date.now() - startTime;
    const isUp = apiResponse.status >= 200 && apiResponse.status < 400;

    // Check if we got actual results data
    let hasResults = false;
    if (isUp && apiResponse.data) {
      if (typeof apiResponse.data === 'string') {
        hasResults = apiResponse.data.length > 100 && !apiResponse.data.includes('error');
      } else if (typeof apiResponse.data === 'object') {
        hasResults = true;
      }
    }

    return {
      isUp,
      statusCode: apiResponse.status,
      responseTime,
      hasResults,
      error: isUp ? undefined : `Results API returned HTTP ${apiResponse.status}`,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      isUp: false,
      statusCode: 0,
      responseTime,
      hasResults: false,
      error: errorMessage,
    };
  }
}

/**
 * Monitor an endpoint and save status to database
 */
export async function monitorEndpoint(endpoint: MonitoredEndpoint): Promise<MonitorResult> {
  const previousStatus = await getEndpointStatus(endpoint.id);
  const previousStatusLabel = previousStatus?.status || 'unknown';

  // Check current status
  const currentStatus = await checkSiteStatus(endpoint.endpointUrl);
  const currentStatusLabel: 'up' | 'down' | 'unknown' = currentStatus.isUp ? 'up' : 'down';

  // Determine if state changed
  const stateChanged =
    previousStatusLabel !== 'unknown' && previousStatusLabel !== currentStatusLabel;
  const wentUp = stateChanged && currentStatus.isUp;
  const wentDown = stateChanged && !currentStatus.isUp;

  // Save status to database
  await saveEndpointStatus(endpoint.id, {
    status: currentStatusLabel,
    statusCode: currentStatus.statusCode,
    responseTimeMs: currentStatus.responseTime,
    hasResults: currentStatus.hasResults,
    errorMessage: currentStatus.error || null,
  });

  return {
    currentStatus,
    previousStatus: previousStatusLabel === 'unknown' ? null : (previousStatusLabel as 'up' | 'down'),
    stateChanged,
    wentUp,
    wentDown,
  };
}

/**
 * Quick check an endpoint without saving (for testing)
 */
export async function quickCheckEndpoint(url: string): Promise<SiteStatus> {
  return await checkSiteStatus(url);
}

/**
 * Format status message for notifications
 */
export function formatStatusMessage(result: MonitorResult, url: string, endpointName?: string): string {
  const { currentStatus, wentUp, wentDown } = result;
  const name = endpointName ? `${endpointName} - ` : '';

  if (wentUp) {
    return `🟢 ${name}Results API is back UP!\n\nURL: ${url}\nStatus: ${currentStatus.statusCode}\nResponse Time: ${currentStatus.responseTime}ms\nResults Available: ${currentStatus.hasResults ? 'Yes' : 'Checking...'}\n\nCheck your results now!`;
  }

  if (wentDown) {
    return `🔴 ${name}Results API went DOWN\n\nURL: ${url}\nError: ${currentStatus.error || `HTTP ${currentStatus.statusCode}`}`;
  }

  if (currentStatus.isUp) {
    return `✅ ${name}Results API is UP\n\nStatus: ${currentStatus.statusCode}\nResponse Time: ${currentStatus.responseTime}ms`;
  }

  return `❌ ${name}Results API is DOWN\n\nError: ${currentStatus.error || `HTTP ${currentStatus.statusCode}`}`;
}
