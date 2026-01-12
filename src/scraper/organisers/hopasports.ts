import * as cheerio from 'cheerio';
import axios from 'axios';
import type { OrganiserScraper, ScrapedEvent, ScrapedResults } from './base.js';
import type { RaceResult } from '../../types.js';
import { fetchPage, parseApiResponse, parseResultItem } from '../utils.js';

interface RaceConfig {
  id: string;
  race_id: number;
  pt: string;
  title: string;
}

export class HopasportsScraper implements OrganiserScraper {
  readonly organiser = 'hopasports';

  canHandle(url: string): boolean {
    return url.includes('hopasports.com') || url.includes('hopasports');
  }

  private extractResultsApiUrl(html: string): { baseUrl: string; races: RaceConfig[] } | null {
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

  private async fetchResultsFromApi(
    baseUrl: string,
    raceId: number,
    pt: string
  ): Promise<RaceResult[]> {
    const apiUrl = `${baseUrl}?race_id=${raceId}&pt=${pt}`;
    console.log(`Fetching from API: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      timeout: 60000,
      headers: {
        'User-Agent': 'GRAAFIN/2.0 (Athlete Performance Platform)',
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
      const $ = cheerio.load(data);
      const results: RaceResult[] = [];
      $('tr').each((index, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const getText = (i: number) => $(cells.eq(i)).text().trim();
          const position = parseInt(getText(0), 10);
          if (!isNaN(position)) {
            const result = parseResultItem(
              {
                position: getText(0),
                bib: getText(1),
                name: getText(2),
                gender: getText(3),
                category: getText(4),
                time: getText(5) || getText(4),
              },
              position
            );
            if (result) results.push(result);
          }
        }
      });
      return results;
    }

    return [];
  }

  private extractEventInfo(html: string, url: string): Partial<ScrapedEvent> {
    const $ = cheerio.load(html);
    
    // Try to extract event name from various places
    let eventName = '';
    const titleSelectors = ['h1', 'h2', '.event-title', '[class*="event"]', 'title'];
    for (const selector of titleSelectors) {
      const element = $(selector).first();
      if (element.length) {
        eventName = element.text().trim();
        if (eventName) break;
      }
    }

    // Try to extract date from page
    let eventDate = '';
    const dateMatch = html.match(/(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
    if (dateMatch) {
      eventDate = dateMatch[1];
    }

    // Try to extract location
    let location = '';
    const locationMatch = html.match(/(Dubai|Abu Dhabi|Sharjah|UAE|United Arab Emirates)/i);
    if (locationMatch) {
      location = locationMatch[1];
    }

    return {
      eventName: eventName || 'Unknown Event',
      eventDate: eventDate || new Date().toISOString().split('T')[0],
      location: location || undefined,
    };
  }

  async scrapeEvent(url: string): Promise<ScrapedResults> {
    console.log(`[Hopasports] Fetching page: ${url}`);
    const html = await fetchPage(url);

    const apiConfig = this.extractResultsApiUrl(html);
    const eventInfo = this.extractEventInfo(html, url);

    const allResults: RaceResult[] = [];

    if (apiConfig && apiConfig.races.length > 0) {
      console.log(`[Hopasports] Found ${apiConfig.races.length} race(s) configured`);

      for (const race of apiConfig.races) {
        console.log(`[Hopasports] Fetching results for: ${race.title}`);
        try {
          const results = await this.fetchResultsFromApi(apiConfig.baseUrl, race.race_id, race.pt);
          console.log(`[Hopasports]   Found ${results.length} results`);
          allResults.push(...results);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(`[Hopasports]   Error fetching ${race.title}: ${errorMessage}`);
        }
      }
    } else {
      console.log('[Hopasports] No API configuration found, trying HTML parsing...');
      const $ = cheerio.load(html);
      $('tr').each((index, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const getText = (i: number) => $(cells.eq(i)).text().trim();
          const position = parseInt(getText(0), 10);
          if (!isNaN(position)) {
            const result = parseResultItem(
              {
                position: getText(0),
                bib: getText(1),
                name: getText(2),
                gender: getText(3),
                category: getText(4),
                time: getText(5) || getText(4),
              },
              position
            );
            if (result) allResults.push(result);
          }
        }
      });
    }

    // Determine distance from event name or URL
    const distance = eventInfo.eventName?.toLowerCase().includes('10k') || 
                     eventInfo.eventName?.toLowerCase().includes('10km') ? '10km' :
                     eventInfo.eventName?.toLowerCase().includes('half') ||
                     eventInfo.eventName?.toLowerCase().includes('21km') ||
                     eventInfo.eventName?.toLowerCase().includes('21k') ? 'Half Marathon' :
                     'Unknown';

    const event: ScrapedEvent = {
      organiser: this.organiser,
      eventName: eventInfo.eventName || 'Unknown Event',
      eventDate: eventInfo.eventDate || new Date().toISOString().split('T')[0],
      eventUrl: url,
      distance,
      location: eventInfo.location,
      metadata: {
        racesFound: apiConfig?.races.length || 0,
      },
    };

    return {
      event,
      results: allResults,
    };
  }

  async scrapeAthleteProfile(url: string): Promise<RaceResult[]> {
    console.log(`[Hopasports] Scraping athlete profile: ${url}`);
    const allResults: RaceResult[] = [];

    // Extract athlete name from URL if possible
    const urlMatch = url.match(/\/en\/([^/?]+)/);
    const athleteSlug = urlMatch ? urlMatch[1] : null;

    // Scrape all pages of results
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const pageUrl = `${url.split('?')[0]}?page=${page}`;
      console.log(`[Hopasports]   Fetching page ${page}...`);

      try {
        const html = await fetchPage(pageUrl);
        const $ = cheerio.load(html);

        // Find the results table
        const table = $('table').first();
        if (table.length === 0) {
          hasMorePages = false;
          break;
        }

        let foundResultsOnPage = false;

        // Parse table rows (skip header)
        table.find('tr').slice(1).each((_, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 3) {
            const getText = (i: number) => $(cells.eq(i)).text().trim();
            
            // Extract race name, date, distance, time, positions
            const raceLink = $(cells.eq(0)).find('a').attr('href');
            const raceName = $(cells.eq(0)).find('a').text().trim() || getText(0);
            const finishTime = getText(1);
            const overallRank = getText(2);
            const categoryRank = getText(3);

            if (finishTime && overallRank) {
              const position = parseInt(overallRank, 10);
              if (!isNaN(position)) {
                const result: RaceResult = {
                  position,
                  bibNumber: '',
                  name: athleteSlug || 'Unknown',
                  gender: '',
                  category: '',
                  finishTime,
                  categoryPosition: categoryRank ? parseInt(categoryRank, 10) : undefined,
                };
                allResults.push(result);
                foundResultsOnPage = true;
              }
            }
          }
        });

        // Check for pagination
        const nextPageLink = $('a:contains("›")').last();
        if (nextPageLink.length === 0 || !foundResultsOnPage) {
          hasMorePages = false;
        } else {
          page++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[Hopasports]   Error fetching page ${page}: ${errorMessage}`);
        hasMorePages = false;
      }
    }

    console.log(`[Hopasports]   Scraped ${allResults.length} total results from athlete profile`);
    return allResults;
  }
}
