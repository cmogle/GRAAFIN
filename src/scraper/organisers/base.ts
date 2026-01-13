/**
 * Base types and interfaces for organisers
 * Re-exports from types.ts for backward compatibility
 */

import type { RaceResult } from '../../types.js';
import type {
  OrganiserScraper as EnhancedOrganiserScraper,
  ScraperCapabilities,
  ScrapeOptions,
  ScrapeProgress,
  UrlAnalysis,
  ValidationResult,
  ProgressCallback,
  ScrapeMetadata,
} from '../types.js';

// ============================================
// Legacy interfaces (for backward compatibility)
// ============================================

/**
 * @deprecated Use ScrapedEvent from ../types.js with distances array
 */
export interface ScrapedEvent {
  organiser: string;
  eventName: string;
  eventDate: string;
  eventUrl: string;
  distance?: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

/**
 * @deprecated Use ScrapedResults from ../types.js with scrapeMetadata
 */
export interface ScrapedResults {
  event: ScrapedEvent;
  results: RaceResult[];
  scrapeMetadata?: ScrapeMetadata;
}

// ============================================
// Organiser Scraper Interface
// Supports both legacy and enhanced scrapers
// ============================================

/**
 * Base interface for race organiser scrapers
 * Enhanced scrapers should implement the full interface from ../types.ts
 */
export interface OrganiserScraper {
  /**
   * Unique identifier for this organiser
   */
  readonly organiser: string;

  /**
   * Scraper capabilities (optional for legacy scrapers)
   */
  readonly capabilities?: ScraperCapabilities;

  /**
   * Check if a URL belongs to this organiser
   */
  canHandle(url: string): boolean;

  /**
   * Analyze URL before scraping (optional)
   */
  analyzeUrl?(url: string): Promise<UrlAnalysis>;

  /**
   * Scrape results from an event URL
   * @param url The event results page URL
   * @param options Scrape options (optional)
   * @param onProgress Progress callback (optional)
   * @returns Scraped event and results
   */
  scrapeEvent(
    url: string,
    options?: ScrapeOptions,
    onProgress?: ProgressCallback
  ): Promise<ScrapedResults>;

  /**
   * Validate scraped results (optional)
   */
  validateResults?(results: ScrapedResults): ValidationResult;

  /**
   * Scrape athlete profile page (if supported)
   * @param url The athlete profile URL
   * @returns All race results for this athlete from this organiser
   */
  scrapeAthleteProfile?(url: string): Promise<RaceResult[]>;
}

// Re-export types for convenience
export type {
  ScraperCapabilities,
  ScrapeOptions,
  ScrapeProgress,
  UrlAnalysis,
  ValidationResult,
  ProgressCallback,
  ScrapeMetadata,
};
