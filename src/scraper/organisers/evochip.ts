import * as cheerio from 'cheerio';
import type { OrganiserScraper, ScrapedEvent, ScrapedResults } from './base.js';
import type { RaceResult } from '../../types.js';
import { fetchPage } from '../utils.js';

export class EvoChipScraper implements OrganiserScraper {
  readonly organiser = 'evochip';

  canHandle(url: string): boolean {
    return url.includes('evochip') || url.includes('evochip.hu');
  }

  private async scrapeDistance(baseUrl: string, distance: 'hm' | '10k'): Promise<RaceResult[]> {
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
      // Try to find "Last" link or total count
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

    console.log(`[EvoChip] Found ${totalPages} page(s) for ${distance === 'hm' ? 'Half Marathon' : '10km'}`);

    // Scrape all pages
    for (let page = 1; page <= totalPages; page++) {
      let pageUrl = url;
      if (page > 1) {
        const urlObj = new URL(url);
        urlObj.searchParams.set('page', page.toString());
        pageUrl = urlObj.toString();
      }

      console.log(`[EvoChip]   Scraping page ${page}/${totalPages}...`);
      const pageHtml = await fetchPage(pageUrl);
      const $page = cheerio.load(pageHtml);

      // Find the results table
      const tables = $page('table');
      let table = $page();

      tables.each((_, el) => {
        const firstRow = $page(el).find('tr').first();
        const headerText = firstRow.text().toLowerCase();
        if (headerText.includes('bib') && headerText.includes('name')) {
          table = $page(el);
          return false;
        }
      });

      if (table.length === 0) {
        console.log(`[EvoChip]     No results table found on page ${page}`);
        continue;
      }

      // Find header row to determine column indices
      const headerRow = table.find('tr').first();
      const headerCells = headerRow.find('th, td');
      const columnMap: Record<string, number> = {};

      headerCells.each((index, cell) => {
        const headerText = $page(cell).text().toLowerCase().trim();
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

      // Parse table rows (skip header row)
      const rows = table.find('tr').slice(1);
      let rowIndex = 0;

      rows.each((_, row) => {
        const cells = $page(row).find('td');
        if (cells.length < 3) return;

        const bibText = columnMap.bib !== undefined ? $page(cells.eq(columnMap.bib)).text().trim() : '';
        const nameText = columnMap.name !== undefined ? $page(cells.eq(columnMap.name)).text().trim() : '';

        if (!nameText || nameText === '') {
          return;
        }

        const countryText = columnMap.country !== undefined ? $page(cells.eq(columnMap.country)).text().trim() : '';
        const time5km = columnMap.time5km !== undefined ? $page(cells.eq(columnMap.time5km)).text().trim() : '';
        const time10km = columnMap.time10km !== undefined ? $page(cells.eq(columnMap.time10km)).text().trim() : '';
        const time13km = columnMap.time13km !== undefined ? $page(cells.eq(columnMap.time13km)).text().trim() : '';
        const time15km = columnMap.time15km !== undefined ? $page(cells.eq(columnMap.time15km)).text().trim() : '';
        const finishTime = columnMap.finish !== undefined ? $page(cells.eq(columnMap.finish)).text().trim() : '';
        const genderRankText =
          columnMap.genderRank !== undefined ? $page(cells.eq(columnMap.genderRank)).text().trim() : '';
        const catRankText = columnMap.catRank !== undefined ? $page(cells.eq(columnMap.catRank)).text().trim() : '';

        const position = results.length + rowIndex + 1;

        const genderPosition =
          genderRankText && genderRankText !== '-' && genderRankText !== '' ? parseInt(genderRankText, 10) : undefined;
        const categoryPosition =
          catRankText && catRankText !== '-' && catRankText !== '' ? parseInt(catRankText, 10) : undefined;

        const result: RaceResult = {
          position,
          bibNumber: bibText,
          name: nameText,
          gender: '',
          category: '',
          finishTime: finishTime || '-',
          genderPosition,
          categoryPosition,
          country: countryText || undefined,
          time5km: time5km || undefined,
          time10km: time10km || undefined,
          time13km: time13km || undefined,
          time15km: time15km || undefined,
        };

        results.push(result);
        rowIndex++;
      });

      console.log(`[EvoChip]     Found ${rowIndex} results on page ${page}`);
    }

    return results;
  }

  async scrapeEvent(url: string): Promise<ScrapedResults> {
    console.log(`[EvoChip] Fetching EvoChip results: ${url}`);

    // Parse the URL to extract base parameters
    const urlObj = new URL(url);
    const eventId = urlObj.searchParams.get('eventid') || '';

    // Build base URL (without distance parameter)
    const baseUrlObj = new URL(url);
    baseUrlObj.searchParams.delete('distance');
    baseUrlObj.searchParams.delete('page');
    const baseUrl = baseUrlObj.toString();

    // Scrape both distances
    console.log('[EvoChip] Scraping Half Marathon results...');
    const halfMarathon = await this.scrapeDistance(baseUrl, 'hm');

    console.log('[EvoChip] Scraping 10km results...');
    const tenKm = await this.scrapeDistance(baseUrl, '10k');

    // Extract event name from a sample page
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

      // Try to extract date
      const dateMatch = sampleHtml.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        eventDate = dateMatch[1];
      }
    } catch (error) {
      // Use defaults if extraction fails
    }

    const allResults = [...halfMarathon, ...tenKm];

    const event: ScrapedEvent = {
      organiser: this.organiser,
      eventName,
      eventDate,
      eventUrl: baseUrl,
      distance: 'Multiple', // EvoChip events often have multiple distances
      metadata: {
        eventId,
        halfMarathonCount: halfMarathon.length,
        tenKmCount: tenKm.length,
      },
    };

    return {
      event,
      results: allResults,
    };
  }
}
