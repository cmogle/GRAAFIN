import type { RaceResult } from '../../types.js';

export interface ScrapedEvent {
  organiser: string;
  eventName: string;
  eventDate: string;
  eventUrl: string;
  distance: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

export interface ScrapedResults {
  event: ScrapedEvent;
  results: RaceResult[];
}

/**
 * Base interface for race organiser scrapers
 */
export interface OrganiserScraper {
  /**
   * Unique identifier for this organiser
   */
  readonly organiser: string;

  /**
   * Check if a URL belongs to this organiser
   */
  canHandle(url: string): boolean;

  /**
   * Scrape results from an event URL
   * @param url The event results page URL
   * @returns Scraped event and results
   */
  scrapeEvent(url: string): Promise<ScrapedResults>;

  /**
   * Scrape athlete profile page (if supported)
   * @param url The athlete profile URL
   * @returns All race results for this athlete from this organiser
   */
  scrapeAthleteProfile?(url: string): Promise<RaceResult[]>;
}
