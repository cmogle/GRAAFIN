import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { RaceResult, RaceData } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use DATA_PATH env var for persistent storage (e.g., Render disk), fallback to local
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');

// Event identifiers
export type EventId = 'dcs' | 'plus500';

export function getResultsFilePath(eventId: EventId = 'dcs'): string {
  if (eventId === 'plus500') {
    return path.join(DATA_DIR, 'results-plus500.json');
  }
  return RESULTS_FILE; // Default to 'dcs'
}

// Hopasports API configuration - extracted from the page HTML
interface RaceConfig {
  id: string;
  race_id: number;
  pt: string;
  title: string;
}

export function extractResultsApiUrl(html: string): { baseUrl: string; races: RaceConfig[] } | null {
  const $ = cheerio.load(html);

  // Find the results Vue component which contains the API URL
  const resultsComponent = $('#results_container results');
  if (resultsComponent.length === 0) return null;

  const resultsUrl = resultsComponent.attr('results_url');
  const racesAttr = resultsComponent.attr(':races_with_pt');

  if (!resultsUrl) return null;

  let races: RaceConfig[] = [];
  if (racesAttr) {
    try {
      // Parse the JSON.parse('...') wrapper
      const jsonMatch = racesAttr.match(/JSON\.parse\('(.+)'\)/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1]
          .replace(/\\u0022/g, '"')
          .replace(/\\\//g, '/');
        races = JSON.parse(jsonStr);
      }
    } catch {
      // Failed to parse races config
    }
  }

  return { baseUrl: resultsUrl, races };
}

export async function fetchPage(url: string): Promise<string> {
  const response = await axios.get(url, {
    timeout: 60000,
    headers: {
      'User-Agent': 'HopaChecker/1.0 (Race Results Monitor)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return response.data;
}

export async function fetchResultsFromApi(
  baseUrl: string,
  raceId: number,
  pt: string
): Promise<RaceResult[]> {
  const apiUrl = `${baseUrl}?race_id=${raceId}&pt=${pt}`;
  console.log(`Fetching from API: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    timeout: 60000,
    headers: {
      'User-Agent': 'HopaChecker/1.0 (Race Results Monitor)',
      'Accept': 'application/json, text/html, */*',
    },
  });

  const data = response.data;

  // If response is JSON, parse it directly
  if (typeof data === 'object' && data !== null) {
    return parseApiResponse(data);
  }

  // If HTML, try to extract results from it
  if (typeof data === 'string') {
    return parseHtmlResults(data);
  }

  return [];
}

function parseApiResponse(data: unknown): RaceResult[] {
  const results: RaceResult[] = [];

  // Handle different API response formats
  if (Array.isArray(data)) {
    // Direct array of results
    data.forEach((item: Record<string, unknown>, index) => {
      const result = parseResultItem(item, index + 1);
      if (result) results.push(result);
    });
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // Check for results in common wrapper properties
    const resultsArray = obj.results || obj.data || obj.items || obj.athletes;
    if (Array.isArray(resultsArray)) {
      resultsArray.forEach((item: Record<string, unknown>, index) => {
        const result = parseResultItem(item, index + 1);
        if (result) results.push(result);
      });
    }
  }

  return results;
}

function parseResultItem(item: Record<string, unknown>, defaultPosition: number): RaceResult | null {
  const getString = (keys: string[]): string => {
    for (const key of keys) {
      const value = item[key];
      if (value !== undefined && value !== null) {
        return String(value).trim();
      }
    }
    return '';
  };

  const getNumber = (keys: string[], defaultValue: number = 0): number => {
    for (const key of keys) {
      if (item[key] !== undefined) {
        const num = parseInt(String(item[key]), 10);
        if (!isNaN(num)) return num;
      }
    }
    return defaultValue;
  };

  // Try various field names used by race timing systems
  const name = getString([
    'name', 'Name', 'athlete', 'Athlete', 'runner', 'Runner',
    'full_name', 'fullName', 'participant', 'firstname', 'first_name'
  ]);

  if (!name) return null;

  return {
    position: getNumber(['position', 'Position', 'pos', 'Pos', 'rank', 'Rank', 'place', 'Place', 'overall_rank'], defaultPosition),
    bibNumber: getString(['bib', 'Bib', 'bibNumber', 'BibNumber', 'number', 'Number', 'bib_number', 'bibNo']),
    name,
    gender: getString(['gender', 'Gender', 'sex', 'Sex', 'g']),
    category: getString(['category', 'Category', 'ageGroup', 'AgeGroup', 'division', 'Division', 'cat', 'age_group']),
    finishTime: getString(['time', 'Time', 'finishTime', 'FinishTime', 'chipTime', 'ChipTime', 'netTime', 'NetTime', 'finish_time', 'net_time', 'gun_time']),
    pace: getString(['pace', 'Pace', 'avgPace', 'AvgPace', 'avg_pace']) || undefined,
    genderPosition: getNumber(['gender_rank', 'genderRank', 'gender_position', 'sex_rank']) || undefined,
    categoryPosition: getNumber(['category_rank', 'categoryRank', 'cat_rank', 'age_group_rank']) || undefined,
  };
}

function parseHtmlResults(html: string): RaceResult[] {
  const $ = cheerio.load(html);
  const results: RaceResult[] = [];

  // Try to find table rows
  $('tr').each((index, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 3) {
      const getText = (i: number) => $(cells.eq(i)).text().trim();
      const position = parseInt(getText(0), 10);

      if (!isNaN(position)) {
        results.push({
          position,
          bibNumber: getText(1) || '',
          name: getText(2) || '',
          gender: getText(3) || '',
          category: getText(4) || '',
          finishTime: getText(5) || getText(4) || '',
        });
      }
    }
  });

  return results;
}

export async function checkResultsApiStatus(url: string): Promise<{ isUp: boolean; statusCode: number; error?: string }> {
  try {
    // First fetch the main page to get the API URL
    const html = await fetchPage(url);
    const apiConfig = extractResultsApiUrl(html);

    if (!apiConfig || apiConfig.races.length === 0) {
      return { isUp: true, statusCode: 200 }; // Page loads but no races configured yet
    }

    // Try to fetch results from the first race
    const firstRace = apiConfig.races[0];
    const apiUrl = `${apiConfig.baseUrl}?race_id=${firstRace.race_id}&pt=${firstRace.pt}`;

    const response = await axios.get(apiUrl, {
      timeout: 30000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'HopaChecker/1.0 (Race Results Monitor)',
      },
    });

    return {
      isUp: response.status >= 200 && response.status < 400,
      statusCode: response.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { isUp: false, statusCode: 0, error: errorMessage };
  }
}

export async function scrapeAllResults(url: string): Promise<RaceData> {
  console.log(`Fetching page: ${url}`);
  const html = await fetchPage(url);

  const apiConfig = extractResultsApiUrl(html);

  const halfMarathon: RaceResult[] = [];
  const tenKm: RaceResult[] = [];

  if (apiConfig && apiConfig.races.length > 0) {
    console.log(`Found ${apiConfig.races.length} race(s) configured`);

    for (const race of apiConfig.races) {
      console.log(`Fetching results for: ${race.title}`);
      try {
        const results = await fetchResultsFromApi(apiConfig.baseUrl, race.race_id, race.pt);
        console.log(`  Found ${results.length} results`);

        // Categorize by race title
        const title = race.title.toLowerCase();
        if (title.includes('10k') || title.includes('10km')) {
          tenKm.push(...results);
        } else {
          halfMarathon.push(...results);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`  Error fetching ${race.title}: ${errorMessage}`);
      }
    }
  } else {
    console.log('No API configuration found, trying HTML parsing...');
    const results = parseHtmlResults(html);
    halfMarathon.push(...results);
  }

  const raceData: RaceData = {
    eventName: 'Marina Home Dubai Creek Striders Half Marathon & 10km 2026',
    eventDate: '2026-01-11',
    url,
    scrapedAt: new Date().toISOString(),
    categories: {
      halfMarathon,
      tenKm,
    },
  };

  return raceData;
}

export async function scrapePlus500Results(url: string = 'https://results.hopasports.com/event/plus500-city-half-marathon-dubai-2025'): Promise<RaceData> {
  console.log(`Fetching page: ${url}`);
  const html = await fetchPage(url);

  const apiConfig = extractResultsApiUrl(html);

  const halfMarathon: RaceResult[] = [];
  const tenKm: RaceResult[] = [];

  if (apiConfig && apiConfig.races.length > 0) {
    console.log(`Found ${apiConfig.races.length} race(s) configured`);

    for (const race of apiConfig.races) {
      // Only fetch 21KM/Half Marathon races for Plus500 event
      const title = race.title.toLowerCase();
      const is21km = title.includes('21') || title.includes('half') || title.includes('21k') || title.includes('21km');
      
      if (!is21km) {
        console.log(`  Skipping ${race.title} (only fetching 21KM for Plus500 event)`);
        continue;
      }

      console.log(`Fetching results for: ${race.title}`);
      try {
        const results = await fetchResultsFromApi(apiConfig.baseUrl, race.race_id, race.pt);
        console.log(`  Found ${results.length} results`);
        halfMarathon.push(...results);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`  Error fetching ${race.title}: ${errorMessage}`);
      }
    }
  } else {
    console.log('No API configuration found, trying HTML parsing...');
    const results = parseHtmlResults(html);
    halfMarathon.push(...results);
  }

  const raceData: RaceData = {
    eventName: 'Plus500 City Half Marathon Dubai 2025',
    eventDate: '2025-11-16',
    url,
    scrapedAt: new Date().toISOString(),
    categories: {
      halfMarathon,
      tenKm, // Empty for Plus500
    },
  };

  return raceData;
}

export function saveResults(data: RaceData, eventId: EventId = 'dcs'): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const filePath = getResultsFilePath(eventId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Results saved to: ${filePath}`);
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function loadResults(eventId: EventId = 'dcs'): RaceData | null {
  try {
    const filePath = getResultsFilePath(eventId);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // File doesn't exist or is corrupted
  }
  return null;
}
