import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RaceResult } from '../types.js';

export async function fetchPage(url: string): Promise<string> {
  const response = await axios.get(url, {
    timeout: 60000,
    headers: {
      'User-Agent': 'GRAAFIN/2.0 (Athlete Performance Platform)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return response.data;
}

export function parseResultItem(item: Record<string, unknown>, defaultPosition: number): RaceResult | null {
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
    country: getString(['country', 'Country', 'nation', 'Nation']) || undefined,
    time5km: getString(['time_5km', 'time5km', '5km', '5km_time']) || undefined,
    time10km: getString(['time_10km', 'time10km', '10km', '10km_time']) || undefined,
    time13km: getString(['time_13km', 'time13km', '13km', '13km_time']) || undefined,
    time15km: getString(['time_15km', 'time15km', '15km', '15km_time']) || undefined,
  };
}

export function parseApiResponse(data: unknown): RaceResult[] {
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

export function parseHtmlResults(html: string): RaceResult[] {
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
