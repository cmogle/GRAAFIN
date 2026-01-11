import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { MonitorState, SiteStatus } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use DATA_PATH env var for persistent storage (e.g., Render disk), fallback to local
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

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

export async function checkSiteStatus(url: string): Promise<SiteStatus> {
  const startTime = Date.now();

  try {
    // First, fetch the main page
    const pageResponse = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'HopaChecker/1.0 (Race Results Monitor)',
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
        'User-Agent': 'HopaChecker/1.0 (Race Results Monitor)',
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

export function loadState(): MonitorState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // State file doesn't exist or is corrupted, use default
  }

  return {
    lastStatus: 'unknown',
    lastChecked: new Date().toISOString(),
    lastStatusChange: new Date().toISOString(),
    consecutiveFailures: 0,
  };
}

export function saveState(state: MonitorState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export interface MonitorResult {
  currentStatus: SiteStatus;
  previousState: MonitorState;
  stateChanged: boolean;
  wentUp: boolean;
  wentDown: boolean;
}

export async function monitor(url: string): Promise<MonitorResult> {
  const previousState = loadState();
  const currentStatus = await checkSiteStatus(url);

  const currentStatusLabel = currentStatus.isUp ? 'up' : 'down';
  const stateChanged = previousState.lastStatus !== currentStatusLabel &&
                       previousState.lastStatus !== 'unknown';
  const wentUp = stateChanged && currentStatus.isUp;
  const wentDown = stateChanged && !currentStatus.isUp;

  // Update state
  const newState: MonitorState = {
    lastStatus: currentStatusLabel,
    lastChecked: new Date().toISOString(),
    lastStatusChange: stateChanged ? new Date().toISOString() : previousState.lastStatusChange,
    consecutiveFailures: currentStatus.isUp ? 0 : previousState.consecutiveFailures + 1,
  };

  saveState(newState);

  return {
    currentStatus,
    previousState,
    stateChanged,
    wentUp,
    wentDown,
  };
}

export function formatStatusMessage(result: MonitorResult, url: string): string {
  const { currentStatus, wentUp, wentDown } = result;

  if (wentUp) {
    return `🟢 Results API is back UP!\n\nURL: ${url}\nStatus: ${currentStatus.statusCode}\nResponse Time: ${currentStatus.responseTime}ms\nResults Available: ${currentStatus.hasResults ? 'Yes' : 'Checking...'}\n\nCheck your results now!`;
  }

  if (wentDown) {
    return `🔴 Results API went DOWN\n\nURL: ${url}\nError: ${currentStatus.error || `HTTP ${currentStatus.statusCode}`}`;
  }

  if (currentStatus.isUp) {
    return `✅ Results API is UP\n\nStatus: ${currentStatus.statusCode}\nResponse Time: ${currentStatus.responseTime}ms`;
  }

  return `❌ Results API is DOWN\n\nError: ${currentStatus.error || `HTTP ${currentStatus.statusCode}`}\nConsecutive Failures: ${result.previousState.consecutiveFailures + 1}`;
}
