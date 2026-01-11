import express from 'express';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import Fuse, { type IFuseOptions } from 'fuse.js';
import { loadResults, getResultsFilePath } from './scraper.js';
import { loadState } from './monitor.js';
import type { RaceResult, RaceData } from './types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Fuse.js configuration for fuzzy search
const FUSE_OPTIONS: IFuseOptions<RaceResult & { race: string }> = {
  keys: ['name'],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Get current status
app.get('/api/status', (_req, res) => {
  const state = loadState();
  const data = loadResults();

  res.json({
    monitor: state,
    hasResults: !!data,
    resultCount: data
      ? data.categories.halfMarathon.length + data.categories.tenKm.length
      : 0,
    scrapedAt: data?.scrapedAt || null,
    eventName: data?.eventName || null,
  });
});

// API: Search results
app.get('/api/search', (req, res) => {
  const query = (req.query.q as string || '').trim();

  if (!query) {
    return res.json({ query: '', results: [], total: 0 });
  }

  const data = loadResults();
  if (!data) {
    return res.json({
      query,
      results: [],
      total: 0,
      error: 'No results available yet. Check back later.',
    });
  }

  // Combine all results with race type
  const allResults: (RaceResult & { race: string })[] = [
    ...data.categories.halfMarathon.map(r => ({ ...r, race: 'Half Marathon' })),
    ...data.categories.tenKm.map(r => ({ ...r, race: '10km' })),
  ];

  const fuse = new Fuse(allResults, FUSE_OPTIONS);
  const matches = fuse.search(query, { limit: 20 });

  const results = matches.map(match => ({
    name: match.item.name,
    position: match.item.position,
    bibNumber: match.item.bibNumber,
    finishTime: match.item.finishTime,
    race: match.item.race,
    gender: match.item.gender,
    category: match.item.category,
    confidence: Math.round((1 - (match.score ?? 0)) * 100),
  }));

  return res.json({
    query,
    results,
    total: results.length,
    scrapedAt: data.scrapedAt,
  });
});

// API: Download all results as JSON
app.get('/api/download/json', (_req, res) => {
  const data = loadResults();
  if (!data) {
    return res.status(404).json({ error: 'No results available' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="dcs-half-marathon-results.json"'
  );
  return res.json(data);
});

// API: Download all results as CSV
app.get('/api/download/csv', (_req, res) => {
  const data = loadResults();
  if (!data) {
    return res.status(404).json({ error: 'No results available' });
  }

  const allResults = [
    ...data.categories.halfMarathon.map(r => ({ ...r, race: 'Half Marathon' })),
    ...data.categories.tenKm.map(r => ({ ...r, race: '10km' })),
  ];

  // Create CSV
  const headers = ['Position', 'Bib', 'Name', 'Gender', 'Category', 'Time', 'Race'];
  const rows = allResults.map(r => [
    r.position,
    r.bibNumber,
    `"${r.name.replace(/"/g, '""')}"`,
    r.gender,
    r.category,
    r.finishTime,
    r.race,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="dcs-half-marathon-results.csv"'
  );
  return res.send(csv);
});

// API: Get all results (for bulk access)
app.get('/api/results', (_req, res) => {
  const data = loadResults();
  if (!data) {
    return res.status(404).json({ error: 'No results available' });
  }
  return res.json(data);
});

// Serve the main HTML page for all other routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🏃 HopaChecker server running at http://localhost:${PORT}`);
  console.log(`📁 Results file: ${getResultsFilePath()}`);
});
