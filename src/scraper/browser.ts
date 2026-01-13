/**
 * Browser Manager for Playwright
 * Handles headless browser lifecycle for scraping JavaScript-rendered pages
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';

// ============================================
// Configuration
// ============================================

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const NAVIGATION_TIMEOUT = 60000; // 60 seconds for navigation
const MAX_CONCURRENT_PAGES = 3;

// User agents to rotate (appear as different browsers)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

// Viewports to appear more human
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
];

// ============================================
// Types
// ============================================

export interface PageOptions {
  /** Custom user agent */
  userAgent?: string;
  /** Custom viewport */
  viewport?: { width: number; height: number };
  /** Block images/CSS for faster loading */
  blockResources?: boolean;
  /** Timeout for operations */
  timeout?: number;
}

export interface PaginationInfo {
  /** Total pages detected */
  totalPages: number;
  /** Current page */
  currentPage: number;
  /** Whether there's a next page */
  hasNextPage: boolean;
  /** Selector for next page link/button */
  nextPageSelector?: string;
}

export interface TableData {
  /** Column headers */
  headers: string[];
  /** Table rows */
  rows: string[][];
}

// ============================================
// Browser Manager Class
// ============================================

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pageCount = 0;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
    // Prevent multiple concurrent initializations
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    if (this.browser) {
      return;
    }

    this.isInitializing = true;
    this.initPromise = this._doInitialize();
    await this.initPromise;
    this.isInitializing = false;
  }

  private async _doInitialize(): Promise<void> {
    console.log('[BrowserManager] Initializing Playwright browser...');

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      });

      // Create a browser context with stealth settings
      const userAgent = this.getRandomUserAgent();
      const viewport = this.getRandomViewport();

      this.context = await this.browser.newContext({
        userAgent,
        viewport,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        // Block unnecessary requests for speed
        bypassCSP: true,
      });

      // Set default timeouts
      this.context.setDefaultTimeout(DEFAULT_TIMEOUT);
      this.context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

      console.log('[BrowserManager] Browser initialized successfully');
    } catch (error) {
      console.error('[BrowserManager] Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Get a new page
   */
  async getPage(options: PageOptions = {}): Promise<Page> {
    await this.initialize();

    if (!this.context) {
      throw new Error('Browser context not available');
    }

    if (this.pageCount >= MAX_CONCURRENT_PAGES) {
      throw new Error(`Maximum concurrent pages (${MAX_CONCURRENT_PAGES}) reached`);
    }

    const page = await this.context.newPage();
    this.pageCount++;

    // Apply custom settings
    if (options.timeout) {
      page.setDefaultTimeout(options.timeout);
    }

    if (options.viewport) {
      await page.setViewportSize(options.viewport);
    }

    // Block resources if requested (faster scraping)
    if (options.blockResources) {
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    console.log(`[BrowserManager] Created new page (${this.pageCount} active)`);
    return page;
  }

  /**
   * Close a page
   */
  async closePage(page: Page): Promise<void> {
    try {
      await page.close();
      this.pageCount = Math.max(0, this.pageCount - 1);
      console.log(`[BrowserManager] Closed page (${this.pageCount} active)`);
    } catch (error) {
      console.error('[BrowserManager] Error closing page:', error);
    }
  }

  /**
   * Shutdown the browser completely
   */
  async shutdown(): Promise<void> {
    console.log('[BrowserManager] Shutting down browser...');

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.pageCount = 0;
    console.log('[BrowserManager] Browser shut down');
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null;
  }

  // ============================================
  // Scraping Helpers
  // ============================================

  /**
   * Wait for pagination to render and detect total pages
   */
  async waitForPagination(page: Page): Promise<PaginationInfo> {
    // Common pagination selectors
    const paginationSelectors = [
      'nav[aria-label="pagination"]',
      '.pagination',
      '[class*="pagination"]',
      '[class*="pager"]',
      'ul.pages',
      '.page-numbers',
    ];

    // Try to find pagination
    let paginationElement = null;
    for (const selector of paginationSelectors) {
      try {
        paginationElement = await page.waitForSelector(selector, {
          timeout: 5000,
        });
        if (paginationElement) break;
      } catch {
        // Continue to next selector
      }
    }

    if (!paginationElement) {
      // No pagination found - assume single page
      return {
        totalPages: 1,
        currentPage: 1,
        hasNextPage: false,
      };
    }

    // Extract page numbers
    const pageNumbers: number[] = [];
    const links = await page.$$('a[href*="page="], a[href*="page/"]');

    for (const link of links) {
      const href = await link.getAttribute('href');
      if (href) {
        const match = href.match(/page[=/](\d+)/i);
        if (match) {
          pageNumbers.push(parseInt(match[1], 10));
        }
      }
    }

    // Also check for text-based page numbers
    const pageLinks = await page.$$('[class*="page"] a, .pagination a');
    for (const link of pageLinks) {
      const text = await link.textContent();
      if (text) {
        const num = parseInt(text.trim(), 10);
        if (!isNaN(num) && num > 0) {
          pageNumbers.push(num);
        }
      }
    }

    const totalPages = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;

    // Detect current page
    const activePageSelectors = [
      '.pagination .active',
      '.page.current',
      '[aria-current="page"]',
      '.pagination li.active',
    ];

    let currentPage = 1;
    for (const selector of activePageSelectors) {
      try {
        const active = await page.$(selector);
        if (active) {
          const text = await active.textContent();
          if (text) {
            const num = parseInt(text.trim(), 10);
            if (!isNaN(num)) {
              currentPage = num;
              break;
            }
          }
        }
      } catch {
        // Continue
      }
    }

    // Check for next page link
    const nextSelectors = [
      'a[rel="next"]',
      '.pagination .next:not(.disabled)',
      'a:has-text("Next")',
      'a:has-text("›")',
      'a:has-text("»")',
    ];

    let hasNextPage = false;
    let nextPageSelector: string | undefined;

    for (const selector of nextSelectors) {
      try {
        const next = await page.$(selector);
        if (next) {
          hasNextPage = true;
          nextPageSelector = selector;
          break;
        }
      } catch {
        // Continue
      }
    }

    return {
      totalPages,
      currentPage,
      hasNextPage,
      nextPageSelector,
    };
  }

  /**
   * Scroll to load lazy content
   */
  async scrollToLoadContent(page: Page, maxScrolls = 10): Promise<void> {
    let lastHeight = 0;
    let scrollCount = 0;

    while (scrollCount < maxScrolls) {
      // Scroll to bottom (runs in browser context)
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');

      // Wait for potential content loading
      await page.waitForTimeout(500);

      // Check if height changed (runs in browser context)
      const newHeight = await page.evaluate('document.body.scrollHeight') as number;

      if (newHeight === lastHeight) {
        // No more content loading
        break;
      }

      lastHeight = newHeight;
      scrollCount++;
    }

    // Scroll back to top (runs in browser context)
    await page.evaluate('window.scrollTo(0, 0)');
  }

  /**
   * Extract table data from page
   */
  async extractTableData(page: Page, selector = 'table'): Promise<TableData> {
    const table = await page.$(selector);
    if (!table) {
      return { headers: [], rows: [] };
    }

    // Extract headers
    const headers: string[] = [];
    const headerCells = await table.$$('thead th, thead td, tr:first-child th, tr:first-child td');

    for (const cell of headerCells) {
      const text = await cell.textContent();
      headers.push(text?.trim() || '');
    }

    // Extract rows
    const rows: string[][] = [];
    const tableRows = await table.$$('tbody tr, tr:not(:first-child)');

    for (const row of tableRows) {
      const rowData: string[] = [];
      const cells = await row.$$('td');

      for (const cell of cells) {
        const text = await cell.textContent();
        rowData.push(text?.trim() || '');
      }

      if (rowData.length > 0) {
        rows.push(rowData);
      }
    }

    return { headers, rows };
  }

  /**
   * Navigate to a page and wait for content
   */
  async navigateAndWait(
    page: Page,
    url: string,
    waitSelector?: string
  ): Promise<void> {
    await page.goto(url, { waitUntil: 'networkidle' });

    if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: DEFAULT_TIMEOUT });
    }
  }

  /**
   * Take a screenshot for debugging
   */
  async takeScreenshot(page: Page, path: string): Promise<void> {
    await page.screenshot({ path, fullPage: true });
    console.log(`[BrowserManager] Screenshot saved to ${path}`);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private getRandomViewport(): { width: number; height: number } {
    return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  }
}

// ============================================
// Export Singleton Instance
// ============================================

export const browserManager = new BrowserManager();

// Graceful shutdown on process exit
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
