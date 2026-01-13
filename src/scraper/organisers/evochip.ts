import * as cheerio from 'cheerio';
import type {
  OrganiserScraper,
  ScrapedEvent,
  ScrapedResults,
  ScraperCapabilities,
  ScrapeOptions,
  UrlAnalysis,
  ValidationResult,
  ProgressCallback,
  ScrapeMetadata,
} from './base.js';
import type { RaceResult } from '../../types.js';
import { fetchPage } from '../utils.js';
import { browserManager } from '../browser.js';
import type { ScrapeError, ScrapeWarning } from '../types.js';

// ============================================
// EvoChip Scraper with Playwright Support
// ============================================

export class EvoChipScraper implements OrganiserScraper {
  readonly organiser = 'evochip';

  readonly capabilities: ScraperCapabilities = {
    supportsHeadlessBrowser: true,
    supportsPagination: true,
    supportsMultipleDistances: true,
    supportsCheckpoints: true,
    expectedCheckpointsByDistance: {
      'Half Marathon': ['5km', '10km', '13km', '15km'],
      '10K': ['5km'],
      Marathon: ['5km', '10km', '15km', '21.1km', '25km', '30km', '35km', '40km'],
    },
  };

  canHandle(url: string): boolean {
    return url.includes('evochip') || url.includes('evochip.hu');
  }

  /**
   * Analyze URL before scraping
   */
  async analyzeUrl(url: string): Promise<UrlAnalysis> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    try {
      // Quick fetch to check accessibility
      const html = await fetchPage(url);
      const $ = cheerio.load(html);

      // Check for pagination (might be JS-rendered)
      const paginationLinks = $('a[href*="page="]');
      if (paginationLinks.length === 0) {
        issues.push('No pagination detected - may require headless browser');
        suggestions.push('Enable headless browser mode for full results');
      }

      // Try to detect event name
      const eventName = $('h1, h2, .event-title, title').first().text().trim();

      // Estimate distances
      const estimatedDistances: string[] = [];
      if (html.includes('hm') || html.includes('half')) {
        estimatedDistances.push('Half Marathon');
      }
      if (html.includes('10k') || html.includes('10km')) {
        estimatedDistances.push('10K');
      }

      // Check table for result count estimate
      const tableRows = $('table tr').length;
      const estimatedResultCount = tableRows > 1 ? (tableRows - 1) * 2 : undefined; // Rough estimate

      return {
        isValid: true,
        detectedOrganiser: this.organiser,
        eventName: eventName || undefined,
        estimatedDistances,
        estimatedResultCount,
        requiresHeadlessBrowser: paginationLinks.length === 0,
        issues,
        suggestions,
      };
    } catch (error) {
      return {
        isValid: false,
        detectedOrganiser: this.organiser,
        estimatedDistances: [],
        requiresHeadlessBrowser: true,
        issues: [`Failed to analyze URL: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Validate scraped results
   */
  validateResults(results: ScrapedResults): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];
    let resultsWithAllFields = 0;
    let resultsWithCheckpoints = 0;
    const fieldPopulation: Record<string, number> = {};

    const fields = ['position', 'bibNumber', 'name', 'finishTime', 'time5km', 'time10km'];

    for (const field of fields) {
      fieldPopulation[field] = 0;
    }

    for (let i = 0; i < results.results.length; i++) {
      const result = results.results[i];
      let hasAllFields = true;

      // Check required fields
      if (!result.name) {
        errors.push({
          field: 'name',
          resultIndex: i,
          message: 'Missing athlete name',
          severity: 'critical',
        });
        hasAllFields = false;
      } else {
        fieldPopulation.name++;
      }

      if (result.position) fieldPopulation.position++;
      if (result.bibNumber) fieldPopulation.bibNumber++;
      if (result.finishTime && result.finishTime !== '-') fieldPopulation.finishTime++;
      if (result.time5km) fieldPopulation.time5km++;
      if (result.time10km) fieldPopulation.time10km++;

      if (hasAllFields) resultsWithAllFields++;

      // Check for checkpoints (legacy fields)
      if (result.time5km || result.time10km || result.time13km || result.time15km) {
        resultsWithCheckpoints++;
      }
    }

    // Calculate percentages
    const total = results.results.length;
    for (const field of Object.keys(fieldPopulation)) {
      fieldPopulation[field] = total > 0 ? Math.round((fieldPopulation[field] / total) * 100) : 0;
    }

    // Add warnings for low population
    for (const [field, percentage] of Object.entries(fieldPopulation)) {
      if (percentage < 50 && field !== 'time5km' && field !== 'time10km') {
        warnings.push({
          field,
          message: `Only ${percentage}% of results have ${field}`,
          affectedCount: total - Math.round((percentage / 100) * total),
          percentage: 100 - percentage,
        });
      }
    }

    const completenessScore = Math.round(
      (Object.values(fieldPopulation).reduce((a, b) => a + b, 0) / (fields.length * 100)) * 100
    );

    return {
      isValid: errors.filter((e) => e.severity === 'critical').length === 0,
      completenessScore,
      errors,
      warnings,
      statistics: {
        totalResults: total,
        resultsWithAllFields,
        resultsWithCheckpoints,
        fieldPopulation,
        averageCheckpointsPerResult:
          total > 0 ? resultsWithCheckpoints / total : 0,
      },
    };
  }

  /**
   * Main scrape method with progress tracking
   */
  async scrapeEvent(
    url: string,
    options: ScrapeOptions = {},
    onProgress?: ProgressCallback
  ): Promise<ScrapedResults> {
    const startedAt = new Date();
    const errors: ScrapeError[] = [];
    const warnings: ScrapeWarning[] = [];
    let totalPages = 0;

    onProgress?.({
      stage: 'initializing',
      resultsScraped: 0,
      message: 'Initializing EvoChip scraper...',
    });

    console.log(`[EvoChip] Fetching EvoChip results: ${url}`);

    // Parse the URL to extract base parameters
    const urlObj = new URL(url);
    const eventId = urlObj.searchParams.get('eventid') || '';

    // Build base URL (without distance parameter)
    const baseUrlObj = new URL(url);
    baseUrlObj.searchParams.delete('distance');
    baseUrlObj.searchParams.delete('page');
    const baseUrl = baseUrlObj.toString();

    // Determine distances to scrape
    const distancesToScrape: Array<{ code: 'hm' | '10k'; name: string }> = [];
    if (!options.distances || options.distances.length === 0) {
      distancesToScrape.push(
        { code: 'hm', name: 'Half Marathon' },
        { code: '10k', name: '10K' }
      );
    } else {
      if (options.distances.some((d) => d.toLowerCase().includes('half') || d.toLowerCase().includes('hm'))) {
        distancesToScrape.push({ code: 'hm', name: 'Half Marathon' });
      }
      if (options.distances.some((d) => d.toLowerCase().includes('10k') || d.toLowerCase().includes('10km'))) {
        distancesToScrape.push({ code: '10k', name: '10K' });
      }
    }

    const allResults: RaceResult[] = [];
    const distanceCounts: Record<string, number> = {};

    // Scrape each distance
    for (const distance of distancesToScrape) {
      onProgress?.({
        stage: 'scraping',
        resultsScraped: allResults.length,
        currentDistance: distance.name,
        message: `Scraping ${distance.name} results...`,
      });

      console.log(`[EvoChip] Scraping ${distance.name} results...`);

      try {
        const distanceResults = await this.scrapeDistanceWithPlaywright(
          baseUrl,
          distance.code,
          options,
          (progress) => {
            onProgress?.({
              ...progress,
              currentDistance: distance.name,
              resultsScraped: allResults.length + progress.resultsScraped,
            });
            totalPages = Math.max(totalPages, progress.totalPages || 0);
          }
        );

        // Add distance metadata to results
        for (const result of distanceResults) {
          (result as RaceResult & { metadata?: Record<string, unknown> }).metadata = {
            distance: distance.name,
          };
        }

        allResults.push(...distanceResults);
        distanceCounts[distance.name] = distanceResults.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[EvoChip] Error scraping ${distance.name}:`, errorMessage);
        errors.push({
          type: 'parsing',
          message: `Failed to scrape ${distance.name}: ${errorMessage}`,
          recoverable: true,
        });
      }
    }

    // Extract event name
    onProgress?.({
      stage: 'validating',
      resultsScraped: allResults.length,
      message: 'Extracting event details...',
    });

    let eventName = 'Unknown Event';
    let eventDate = new Date().toISOString().split('T')[0];

    try {
      const sampleUrlObj = new URL(baseUrl);
      sampleUrlObj.searchParams.set('distance', 'hm');
      const sampleHtml = await fetchPage(sampleUrlObj.toString());
      const $ = cheerio.load(sampleHtml);
      const titleMatch = $('h1, h2, .event-title, title').first().text();
      if (titleMatch) {
        eventName = titleMatch.trim();
      }

      const dateMatch = sampleHtml.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        eventDate = dateMatch[1];
      }
    } catch {
      // Use defaults
    }

    const completedAt = new Date();

    const event: ScrapedEvent = {
      organiser: this.organiser,
      eventName,
      eventDate,
      eventUrl: baseUrl,
      distance: 'Multiple',
      metadata: {
        eventId,
        ...distanceCounts,
      },
    };

    const scrapeMetadata: ScrapeMetadata = {
      startedAt,
      completedAt,
      totalPages,
      totalResults: allResults.length,
      usedHeadlessBrowser: options.useHeadlessBrowser ?? false,
      errors,
      warnings,
    };

    onProgress?.({
      stage: 'complete',
      resultsScraped: allResults.length,
      totalPages,
      message: `Completed: ${allResults.length} results from ${totalPages} pages`,
      percentComplete: 100,
    });

    return {
      event,
      results: allResults,
      scrapeMetadata,
    } as ScrapedResults;
  }

  /**
   * Scrape a specific distance with optional Playwright fallback
   */
  private async scrapeDistanceWithPlaywright(
    baseUrl: string,
    distance: 'hm' | '10k',
    options: ScrapeOptions,
    onProgress?: ProgressCallback
  ): Promise<RaceResult[]> {
    // First try static HTML scraping
    const staticResult = await this.scrapeDistanceStatic(baseUrl, distance, onProgress);

    // Check if we got reasonable results
    // If we got exactly round numbers like 1000, pagination might be JS-rendered
    if (
      staticResult.results.length > 0 &&
      staticResult.results.length % 100 === 0 &&
      staticResult.totalPages === 1
    ) {
      console.log(`[EvoChip] Detected possible pagination issue (${staticResult.results.length} results, 1 page). Trying Playwright...`);

      // Try with Playwright
      if (options.useHeadlessBrowser !== false) {
        try {
          return await this.scrapeDistanceHeadless(baseUrl, distance, onProgress);
        } catch (error) {
          console.error('[EvoChip] Playwright scrape failed, using static results:', error);
        }
      }
    }

    return staticResult.results;
  }

  /**
   * Static HTML scraping (original method)
   */
  private async scrapeDistanceStatic(
    baseUrl: string,
    distance: 'hm' | '10k',
    onProgress?: ProgressCallback
  ): Promise<{ results: RaceResult[]; totalPages: number }> {
    const results: RaceResult[] = [];
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('distance', distance);
    const url = urlObj.toString();

    // Fetch first page to determine total pages
    const firstPageHtml = await fetchPage(url);
    const $ = cheerio.load(firstPageHtml);

    // Extract total pages from pagination
    let totalPages = 1;
    const paginationLinks = $('a[href*="page="]');
    const pageNumbers: number[] = [];

    paginationLinks.each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const pageMatch = href.match(/[?&]page=(\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          if (!isNaN(pageNum)) {
            pageNumbers.push(pageNum);
          }
        }
      }
    });

    if (pageNumbers.length > 0) {
      totalPages = Math.max(...pageNumbers);
    } else {
      const lastLink = $('a:contains("Last")');
      if (lastLink.length > 0) {
        const lastHref = lastLink.attr('href');
        if (lastHref) {
          const pageMatch = lastHref.match(/[?&]page=(\d+)/);
          if (pageMatch) {
            totalPages = parseInt(pageMatch[1], 10);
          }
        }
      }
    }

    const distanceName = distance === 'hm' ? 'Half Marathon' : '10km';
    console.log(`[EvoChip] Found ${totalPages} page(s) for ${distanceName}`);

    // Scrape all pages
    for (let page = 1; page <= totalPages; page++) {
      let pageUrl = url;
      if (page > 1) {
        const pageUrlObj = new URL(url);
        pageUrlObj.searchParams.set('page', page.toString());
        pageUrl = pageUrlObj.toString();
      }

      onProgress?.({
        stage: 'scraping',
        currentPage: page,
        totalPages,
        resultsScraped: results.length,
        message: `Scraping page ${page}/${totalPages}...`,
      });

      console.log(`[EvoChip]   Scraping page ${page}/${totalPages}...`);
      const pageHtml = await fetchPage(pageUrl);
      const pageResults = this.parseResultsFromHtml(pageHtml, results.length);
      results.push(...pageResults);
      console.log(`[EvoChip]     Found ${pageResults.length} results on page ${page}`);
    }

    return { results, totalPages };
  }

  /**
   * Headless browser scraping for JS-rendered pages
   */
  private async scrapeDistanceHeadless(
    baseUrl: string,
    distance: 'hm' | '10k',
    onProgress?: ProgressCallback
  ): Promise<RaceResult[]> {
    const results: RaceResult[] = [];
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('distance', distance);
    const url = urlObj.toString();

    const distanceName = distance === 'hm' ? 'Half Marathon' : '10km';
    console.log(`[EvoChip] Using Playwright for ${distanceName}...`);

    const page = await browserManager.getPage({ blockResources: true });

    try {
      // Navigate to page
      await browserManager.navigateAndWait(page, url, 'table');

      // Wait for pagination to render
      await page.waitForTimeout(2000);

      // Detect pagination
      const paginationInfo = await browserManager.waitForPagination(page);
      const totalPages = paginationInfo.totalPages;

      console.log(`[EvoChip] Playwright detected ${totalPages} page(s) for ${distanceName}`);

      // Scrape all pages
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress?.({
          stage: 'scraping',
          currentPage: pageNum,
          totalPages,
          resultsScraped: results.length,
          message: `Scraping page ${pageNum}/${totalPages} with headless browser...`,
        });

        if (pageNum > 1) {
          // Navigate to next page
          const nextPageUrl = new URL(url);
          nextPageUrl.searchParams.set('page', pageNum.toString());
          await page.goto(nextPageUrl.toString(), { waitUntil: 'networkidle' });
          await page.waitForSelector('table');
          await page.waitForTimeout(1000);
        }

        // Extract table data
        const tableData = await browserManager.extractTableData(page, 'table');

        if (tableData.headers.length === 0) {
          console.log(`[EvoChip] No table found on page ${pageNum}`);
          continue;
        }

        // Build column map from headers
        const columnMap = this.buildColumnMap(tableData.headers);

        // Parse rows
        const pageResults = this.parseTableRows(tableData.rows, columnMap, results.length);
        results.push(...pageResults);

        console.log(`[EvoChip]   Found ${pageResults.length} results on page ${pageNum} (Playwright)`);
      }
    } finally {
      await browserManager.closePage(page);
    }

    return results;
  }

  /**
   * Parse results from HTML string
   */
  private parseResultsFromHtml(html: string, startPosition: number): RaceResult[] {
    const results: RaceResult[] = [];
    const $ = cheerio.load(html);

    // Find the results table
    const tables = $('table');
    let table = $();

    tables.each((_, el) => {
      const firstRow = $(el).find('tr').first();
      const headerText = firstRow.text().toLowerCase();
      if (headerText.includes('bib') && headerText.includes('name')) {
        table = $(el);
        return false;
      }
    });

    if (table.length === 0) {
      return results;
    }

    // Build column map
    const headerRow = table.find('tr').first();
    const headerCells = headerRow.find('th, td');
    const columnMap: Record<string, number> = {};

    headerCells.each((index, cell) => {
      const headerText = $(cell).text().toLowerCase().trim();
      if (headerText.includes('bib')) columnMap.bib = index;
      if (headerText.includes('name')) columnMap.name = index;
      if (headerText.includes('country')) columnMap.country = index;
      if (headerText.includes('5km') || headerText === '5km') columnMap.time5km = index;
      if (headerText.includes('10km') || headerText === '10km') columnMap.time10km = index;
      if (headerText.includes('13km') || headerText === '13km') columnMap.time13km = index;
      if (headerText.includes('15km') || headerText === '15km') columnMap.time15km = index;
      if (headerText.includes('finish')) columnMap.finish = index;
      if (headerText.includes('gender') && headerText.includes('rank')) columnMap.genderRank = index;
      if ((headerText.includes('cat') || headerText.includes('category')) && headerText.includes('rank'))
        columnMap.catRank = index;
    });

    // Parse rows
    const rows = table.find('tr').slice(1);
    let rowIndex = 0;

    rows.each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const rowData: string[] = [];
      cells.each((_, cell) => {
        rowData.push($(cell).text().trim());
      });

      const result = this.parseResultRow(rowData, columnMap, startPosition + rowIndex);
      if (result) {
        results.push(result);
        rowIndex++;
      }
    });

    return results;
  }

  /**
   * Build column map from header strings
   */
  private buildColumnMap(headers: string[]): Record<string, number> {
    const columnMap: Record<string, number> = {};

    headers.forEach((header, index) => {
      const h = header.toLowerCase().trim();
      if (h.includes('bib')) columnMap.bib = index;
      if (h.includes('name')) columnMap.name = index;
      if (h.includes('country')) columnMap.country = index;
      if (h.includes('5km') || h === '5km') columnMap.time5km = index;
      if (h.includes('10km') || h === '10km') columnMap.time10km = index;
      if (h.includes('13km') || h === '13km') columnMap.time13km = index;
      if (h.includes('15km') || h === '15km') columnMap.time15km = index;
      if (h.includes('finish')) columnMap.finish = index;
      if (h.includes('gender') && h.includes('rank')) columnMap.genderRank = index;
      if ((h.includes('cat') || h.includes('category')) && h.includes('rank')) columnMap.catRank = index;
    });

    return columnMap;
  }

  /**
   * Parse table rows to results
   */
  private parseTableRows(
    rows: string[][],
    columnMap: Record<string, number>,
    startPosition: number
  ): RaceResult[] {
    const results: RaceResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const result = this.parseResultRow(rows[i], columnMap, startPosition + i);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Parse a single result row
   */
  private parseResultRow(
    rowData: string[],
    columnMap: Record<string, number>,
    position: number
  ): RaceResult | null {
    if (rowData.length < 3) return null;

    const bibText = columnMap.bib !== undefined ? rowData[columnMap.bib] || '' : '';
    const nameText = columnMap.name !== undefined ? rowData[columnMap.name] || '' : '';

    if (!nameText || nameText === '') {
      return null;
    }

    const countryText = columnMap.country !== undefined ? rowData[columnMap.country] || '' : '';
    const time5km = columnMap.time5km !== undefined ? rowData[columnMap.time5km] || '' : '';
    const time10km = columnMap.time10km !== undefined ? rowData[columnMap.time10km] || '' : '';
    const time13km = columnMap.time13km !== undefined ? rowData[columnMap.time13km] || '' : '';
    const time15km = columnMap.time15km !== undefined ? rowData[columnMap.time15km] || '' : '';
    const finishTime = columnMap.finish !== undefined ? rowData[columnMap.finish] || '' : '';
    const genderRankText = columnMap.genderRank !== undefined ? rowData[columnMap.genderRank] || '' : '';
    const catRankText = columnMap.catRank !== undefined ? rowData[columnMap.catRank] || '' : '';

    const genderPosition =
      genderRankText && genderRankText !== '-' && genderRankText !== ''
        ? parseInt(genderRankText, 10)
        : undefined;
    const categoryPosition =
      catRankText && catRankText !== '-' && catRankText !== ''
        ? parseInt(catRankText, 10)
        : undefined;

    return {
      position: position + 1,
      bibNumber: bibText,
      name: nameText,
      gender: '',
      category: '',
      finishTime: finishTime || '-',
      genderPosition: isNaN(genderPosition as number) ? undefined : genderPosition,
      categoryPosition: isNaN(categoryPosition as number) ? undefined : categoryPosition,
      country: countryText || undefined,
      time5km: time5km || undefined,
      time10km: time10km || undefined,
      time13km: time13km || undefined,
      time15km: time15km || undefined,
    };
  }
}
