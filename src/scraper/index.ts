import type { OrganiserScraper } from './organisers/base.js';
import { HopasportsScraper } from './organisers/hopasports.js';
import { EvoChipScraper } from './organisers/evochip.js';

// Registry of available scrapers
const scrapers: OrganiserScraper[] = [
  new HopasportsScraper(),
  new EvoChipScraper(),
];

/**
 * Get the appropriate scraper for a given URL
 */
export function getScraperForUrl(url: string): OrganiserScraper | null {
  for (const scraper of scrapers) {
    if (scraper.canHandle(url)) {
      return scraper;
    }
  }
  return null;
}

/**
 * Get a scraper by organiser name
 */
export function getScraperByOrganiser(organiser: string): OrganiserScraper | null {
  for (const scraper of scrapers) {
    if (scraper.organiser === organiser) {
      return scraper;
    }
  }
  return null;
}

/**
 * Get all available scrapers
 */
export function getAllScrapers(): OrganiserScraper[] {
  return [...scrapers];
}

// Re-export types and scrapers
export type { OrganiserScraper, ScrapedEvent, ScrapedResults } from './organisers/base.js';
export { HopasportsScraper } from './organisers/hopasports.js';
export { EvoChipScraper } from './organisers/evochip.js';
