/**
 * Enhanced Scraper Types
 * Comprehensive type definitions for the sophisticated scraping system
 */

// ============================================
// Timing Checkpoints
// ============================================

/**
 * Flexible timing checkpoint that can represent:
 * - Distance markers (5km, 10km, 21.1km, etc.)
 * - Transitions (T1, T2 for triathlon)
 * - Disciplines (swim, bike, run)
 */
export interface TimingCheckpoint {
  /** Type of checkpoint */
  checkpointType: 'distance' | 'transition' | 'discipline';

  /** Name of the checkpoint (e.g., '5km', 'T1', 'swim') */
  checkpointName: string;

  /** Order in the race (1, 2, 3...) */
  checkpointOrder: number;

  /** Time for this segment only (split time) */
  splitTime?: string;

  /** Total elapsed time at this point */
  cumulativeTime?: string;

  /** Pace at this checkpoint (e.g., '5:30/km') */
  pace?: string;

  /** Distance of this segment in meters */
  segmentDistanceMeters?: number;

  /** Additional checkpoint-specific data */
  metadata?: Record<string, unknown>;
}

// ============================================
// Race Results
// ============================================

/** Participant status in a race */
export type RaceStatus = 'finished' | 'dnf' | 'dns' | 'dq';

/**
 * Enhanced race result with flexible checkpoints
 * Supports all race types: running, triathlon, duathlon, ultra
 */
export interface EnhancedRaceResult {
  /** Overall finishing position */
  position: number;

  /** Bib/race number */
  bibNumber: string;

  /** Athlete name */
  name: string;

  /** Gender (M/F/X) */
  gender: string;

  /** Age category (e.g., 'M40-44', 'F35-39') */
  category: string;

  /** Primary finish time (chip time preferred) */
  finishTime: string;

  /** Gun/gross time (from official start) */
  gunTime?: string;

  /** Chip/net time (from crossing start mat) */
  chipTime?: string;

  /** Average pace */
  pace?: string;

  /** Position within gender category */
  genderPosition?: number;

  /** Position within age category */
  categoryPosition?: number;

  /** Athlete's country */
  country?: string;

  /** Running club affiliation */
  club?: string;

  /** Age at race time */
  age?: number;

  /** Race completion status */
  status: RaceStatus;

  /** Time behind the winner */
  timeBehind?: string;

  /** Flexible timing checkpoints */
  checkpoints: TimingCheckpoint[];

  // Legacy fields for backward compatibility
  time5km?: string;
  time10km?: string;
  time13km?: string;
  time15km?: string;
}

// ============================================
// Event & Distance Types
// ============================================

/** Supported race types */
export type RaceType = 'running' | 'triathlon' | 'duathlon' | 'ultra' | 'relay';

/**
 * Distance offered at an event
 */
export interface EventDistance {
  /** Human-readable distance name */
  distanceName: string;

  /** Distance in meters */
  distanceMeters: number;

  /** Type of race */
  raceType: RaceType;

  /** Expected timing checkpoints for this distance */
  expectedCheckpoints: string[];

  /** Number of participants */
  participantCount?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Scraped event with multiple distances
 */
export interface ScrapedEvent {
  /** Timing provider/organiser */
  organiser: string;

  /** Event name */
  eventName: string;

  /** Event date (YYYY-MM-DD) */
  eventDate: string;

  /** Source URL */
  eventUrl: string;

  /** Event location */
  location?: string;

  /** Distances offered at this event */
  distances: EventDistance[];

  /** Additional event metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Complete scrape results
 */
export interface ScrapedResults {
  /** Event information */
  event: ScrapedEvent;

  /** Race results */
  results: EnhancedRaceResult[];

  /** Scrape metadata for tracking and debugging */
  scrapeMetadata: ScrapeMetadata;
}

// ============================================
// Scraper Capabilities & Configuration
// ============================================

/**
 * Declares what a scraper can do
 */
export interface ScraperCapabilities {
  /** Can use headless browser for JS-rendered pages */
  supportsHeadlessBrowser: boolean;

  /** Can handle paginated results */
  supportsPagination: boolean;

  /** Can scrape multiple distances from one URL */
  supportsMultipleDistances: boolean;

  /** Can extract timing checkpoints */
  supportsCheckpoints: boolean;

  /** Expected checkpoints by distance type */
  expectedCheckpointsByDistance: Record<string, string[]>;
}

/**
 * Options for scraping
 */
export interface ScrapeOptions {
  /** Force headless browser mode */
  useHeadlessBrowser?: boolean;

  /** Maximum pages to scrape (0 = unlimited) */
  maxPages?: number;

  /** Delay between page requests in ms */
  pageDelay?: number;

  /** Request timeout in ms */
  timeout?: number;

  /** Specific distances to scrape (empty = all) */
  distances?: string[];

  /** Validate results during scrape */
  validateOnScrape?: boolean;
}

// ============================================
// Progress Tracking
// ============================================

/** Scrape stage */
export type ScrapeStage =
  | 'initializing'
  | 'connecting'
  | 'detecting_pages'
  | 'scraping'
  | 'validating'
  | 'saving'
  | 'complete'
  | 'error';

/**
 * Real-time scrape progress for UI updates
 */
export interface ScrapeProgress {
  /** Current stage */
  stage: ScrapeStage;

  /** Current page being scraped */
  currentPage?: number;

  /** Total pages detected */
  totalPages?: number;

  /** Results scraped so far */
  resultsScraped: number;

  /** Estimated total results */
  estimatedTotal?: number;

  /** Current distance being scraped */
  currentDistance?: string;

  /** Human-readable status message */
  message: string;

  /** Percentage complete (0-100) */
  percentComplete?: number;

  /** Errors encountered */
  errors?: ScrapeError[];

  /** Warnings encountered */
  warnings?: ScrapeWarning[];
}

// ============================================
// Errors & Warnings
// ============================================

/** Error types */
export type ScrapeErrorType = 'pagination' | 'parsing' | 'network' | 'timeout' | 'validation' | 'browser';

/**
 * Scrape error
 */
export interface ScrapeError {
  /** Error type */
  type: ScrapeErrorType;

  /** Error message */
  message: string;

  /** Page where error occurred */
  page?: number;

  /** Whether scrape can continue */
  recoverable: boolean;

  /** Additional error details */
  details?: Record<string, unknown>;
}

/** Warning types */
export type ScrapeWarningType = 'missing_data' | 'inconsistent_data' | 'unexpected_format' | 'duplicate_result';

/**
 * Scrape warning (non-fatal issue)
 */
export interface ScrapeWarning {
  /** Warning type */
  type: ScrapeWarningType;

  /** Warning message */
  message: string;

  /** Affected fields */
  affectedFields: string[];

  /** Number of results affected */
  count: number;
}

/**
 * Scrape metadata for tracking
 */
export interface ScrapeMetadata {
  /** When scrape started */
  startedAt: Date;

  /** When scrape completed */
  completedAt: Date;

  /** Total pages scraped */
  totalPages: number;

  /** Total results scraped */
  totalResults: number;

  /** Whether headless browser was used */
  usedHeadlessBrowser: boolean;

  /** Errors encountered */
  errors: ScrapeError[];

  /** Warnings encountered */
  warnings: ScrapeWarning[];
}

// ============================================
// URL Analysis (Pre-scrape)
// ============================================

/**
 * Result of analyzing a URL before scraping
 */
export interface UrlAnalysis {
  /** Whether URL is valid and supported */
  isValid: boolean;

  /** Detected timing provider */
  detectedOrganiser: string;

  /** Detected event name (if available) */
  eventName?: string;

  /** Detected event date (if available) */
  eventDate?: string;

  /** Estimated distances available */
  estimatedDistances: string[];

  /** Estimated result count */
  estimatedResultCount?: number;

  /** Whether headless browser is required */
  requiresHeadlessBrowser: boolean;

  /** Any issues detected */
  issues: string[];

  /** Suggestions for better scraping */
  suggestions?: string[];
}

// ============================================
// Validation
// ============================================

/**
 * Validation error
 */
export interface ValidationError {
  /** Field with error */
  field: string;

  /** Result index (if applicable) */
  resultIndex?: number;

  /** Error message */
  message: string;

  /** Severity */
  severity: 'critical' | 'error';
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Field with warning */
  field: string;

  /** Warning message */
  message: string;

  /** Number of results affected */
  affectedCount: number;

  /** Percentage of results affected */
  percentage: number;
}

/**
 * Validation statistics
 */
export interface ValidationStatistics {
  /** Total results validated */
  totalResults: number;

  /** Results with all expected fields */
  resultsWithAllFields: number;

  /** Results with checkpoint data */
  resultsWithCheckpoints: number;

  /** Field population percentages */
  fieldPopulation: Record<string, number>;

  /** Average checkpoints per result */
  averageCheckpointsPerResult: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Overall validity */
  isValid: boolean;

  /** Completeness score (0-100) */
  completenessScore: number;

  /** Critical and error-level issues */
  errors: ValidationError[];

  /** Warnings */
  warnings: ValidationWarning[];

  /** Statistics */
  statistics: ValidationStatistics;
}

// ============================================
// Reconciliation (Multi-source)
// ============================================

/** Match method used */
export type MatchMethod = 'bib' | 'name_time' | 'position_name' | 'manual';

/**
 * Result of matching two athletes
 */
export interface MatchResult {
  /** Whether match was found */
  isMatch: boolean;

  /** Confidence score (0-100) */
  confidence: number;

  /** Method used for matching */
  method: MatchMethod;

  /** Field conflicts detected */
  conflicts?: FieldConflict[];
}

/**
 * Conflict between two data sources
 */
export interface FieldConflict {
  /** Field name */
  field: string;

  /** Value from source A */
  valueA: unknown;

  /** Value from source B */
  valueB: unknown;

  /** Recommended resolution */
  resolution: 'use_a' | 'use_b' | 'merge' | 'manual';

  /** Reason for recommendation */
  reason: string;
}

/**
 * Result of reconciling two events
 */
export interface ReconciliationResult {
  /** Merged results */
  mergedResults: EnhancedRaceResult[];

  /** Number of results matched */
  matchedCount: number;

  /** Unmatched from source A */
  unmatchedFromA: number;

  /** Unmatched from source B */
  unmatchedFromB: number;

  /** Conflicts requiring review */
  conflicts: FieldConflict[];

  /** Reconciliation statistics */
  statistics: {
    totalFromA: number;
    totalFromB: number;
    matchRate: number;
    fieldsEnriched: string[];
  };
}

// ============================================
// Scraper Interface
// ============================================

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: ScrapeProgress) => void;

/**
 * Enhanced organiser scraper interface
 */
export interface OrganiserScraper {
  /** Unique organiser identifier */
  readonly organiser: string;

  /** Scraper capabilities */
  readonly capabilities: ScraperCapabilities;

  /**
   * Check if this scraper can handle a URL
   */
  canHandle(url: string): boolean;

  /**
   * Analyze a URL before scraping
   */
  analyzeUrl(url: string): Promise<UrlAnalysis>;

  /**
   * Scrape event results
   */
  scrapeEvent(
    url: string,
    options?: ScrapeOptions,
    onProgress?: ProgressCallback
  ): Promise<ScrapedResults>;

  /**
   * Validate scraped results
   */
  validateResults(results: ScrapedResults): ValidationResult;

  /**
   * Scrape athlete profile (optional)
   */
  scrapeAthleteProfile?(url: string): Promise<EnhancedRaceResult[]>;
}
