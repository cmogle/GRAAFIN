/**
 * Standard Checkpoint Definitions
 * Industry-standard timing checkpoint configurations for various race types
 */

import type { RaceType } from './types.js';

// ============================================
// Distance Definitions (in meters)
// ============================================

export const DISTANCES = {
  // Running
  '5K': 5000,
  '10K': 10000,
  '15K': 15000,
  '10 Mile': 16093,
  '20K': 20000,
  'Half Marathon': 21097,
  '25K': 25000,
  '30K': 30000,
  'Marathon': 42195,
  'Ultra 50K': 50000,
  'Ultra 50 Mile': 80467,
  'Ultra 100K': 100000,
  'Ultra 100 Mile': 160934,

  // Triathlon Swim
  'Sprint Tri Swim': 750,
  'Olympic Tri Swim': 1500,
  'Half Ironman Swim': 1900,
  'Ironman Swim': 3800,

  // Triathlon Bike
  'Sprint Tri Bike': 20000,
  'Olympic Tri Bike': 40000,
  'Half Ironman Bike': 90000,
  'Ironman Bike': 180000,

  // Triathlon Run
  'Sprint Tri Run': 5000,
  'Olympic Tri Run': 10000,
  'Half Ironman Run': 21097,
  'Ironman Run': 42195,

  // Duathlon
  'Sprint Duathlon Run1': 5000,
  'Sprint Duathlon Bike': 20000,
  'Sprint Duathlon Run2': 2500,
  'Standard Duathlon Run1': 10000,
  'Standard Duathlon Bike': 40000,
  'Standard Duathlon Run2': 5000,
} as const;

// ============================================
// Running Checkpoints
// ============================================

/**
 * Standard checkpoints for running events
 * Based on industry timing conventions
 */
export const RUNNING_CHECKPOINTS: Record<string, string[]> = {
  '5K': ['2.5km', 'finish'],
  '10K': ['5km', 'finish'],
  '15K': ['5km', '10km', 'finish'],
  '10 Mile': ['5km', '10km', 'finish'],
  'Half Marathon': ['5km', '10km', '15km', '20km', 'finish'],
  'Marathon': [
    '5km',
    '10km',
    '15km',
    '21.1km', // Half marathon point
    '25km',
    '30km',
    '35km',
    '40km',
    'finish',
  ],
  'Ultra 50K': ['10km', '20km', '30km', '40km', 'finish'],
  'Ultra 50 Mile': ['10mi', '20mi', '30mi', '40mi', 'finish'],
  'Ultra 100K': ['25km', '50km', '75km', 'finish'],
  'Ultra 100 Mile': ['25mi', '50mi', '75mi', 'finish'],
};

// ============================================
// Triathlon Checkpoints
// ============================================

/**
 * Standard checkpoints for triathlon events
 * Includes swim, transitions (T1/T2), bike, and run segments
 */
export const TRIATHLON_CHECKPOINTS: Record<string, string[]> = {
  'Sprint Triathlon': ['swim', 'T1', 'bike', 'T2', 'run', 'finish'],
  'Olympic Triathlon': ['swim', 'T1', 'bike', 'T2', 'run', 'finish'],
  'Half Ironman': ['swim', 'T1', 'bike', 'T2', 'run_10km', 'finish'],
  'Ironman': ['swim', 'T1', 'bike', 'T2', 'run_21km', 'finish'],
  'Super Sprint Triathlon': ['swim', 'T1', 'bike', 'T2', 'run', 'finish'],
};

/**
 * Triathlon distance details
 */
export const TRIATHLON_DISTANCES: Record<
  string,
  { swim: number; bike: number; run: number }
> = {
  'Super Sprint Triathlon': { swim: 400, bike: 10000, run: 2500 },
  'Sprint Triathlon': { swim: 750, bike: 20000, run: 5000 },
  'Olympic Triathlon': { swim: 1500, bike: 40000, run: 10000 },
  'Half Ironman': { swim: 1900, bike: 90000, run: 21097 },
  'Ironman': { swim: 3800, bike: 180000, run: 42195 },
};

// ============================================
// Duathlon Checkpoints
// ============================================

/**
 * Standard checkpoints for duathlon events
 * Run-Bike-Run format
 */
export const DUATHLON_CHECKPOINTS: Record<string, string[]> = {
  'Sprint Duathlon': ['run1', 'T1', 'bike', 'T2', 'run2', 'finish'],
  'Standard Duathlon': ['run1', 'T1', 'bike', 'T2', 'run2', 'finish'],
  'Long Distance Duathlon': [
    'run1_5km',
    'T1',
    'bike_20km',
    'bike_40km',
    'T2',
    'run2',
    'finish',
  ],
};

/**
 * Duathlon distance details
 */
export const DUATHLON_DISTANCES: Record<
  string,
  { run1: number; bike: number; run2: number }
> = {
  'Sprint Duathlon': { run1: 5000, bike: 20000, run2: 2500 },
  'Standard Duathlon': { run1: 10000, bike: 40000, run2: 5000 },
  'Long Distance Duathlon': { run1: 10000, bike: 60000, run2: 10000 },
};

// ============================================
// Relay Checkpoints
// ============================================

/**
 * Standard checkpoints for relay events
 */
export const RELAY_CHECKPOINTS: Record<string, string[]> = {
  '4x100m Relay': ['leg1', 'leg2', 'leg3', 'leg4', 'finish'],
  '4x400m Relay': ['leg1', 'leg2', 'leg3', 'leg4', 'finish'],
  'Marathon Relay': ['leg1', 'leg2', 'leg3', 'leg4', 'finish'],
  'Ekiden Relay': ['leg1', 'leg2', 'leg3', 'leg4', 'leg5', 'leg6', 'finish'],
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get expected checkpoints for a distance
 */
export function getExpectedCheckpoints(
  distanceName: string,
  raceType: RaceType = 'running'
): string[] {
  switch (raceType) {
    case 'triathlon':
      return TRIATHLON_CHECKPOINTS[distanceName] || [];
    case 'duathlon':
      return DUATHLON_CHECKPOINTS[distanceName] || [];
    case 'relay':
      return RELAY_CHECKPOINTS[distanceName] || [];
    case 'running':
    case 'ultra':
    default:
      return RUNNING_CHECKPOINTS[distanceName] || [];
  }
}

/**
 * Get distance in meters for a named distance
 */
export function getDistanceMeters(distanceName: string): number | null {
  // Check direct match
  if (distanceName in DISTANCES) {
    return DISTANCES[distanceName as keyof typeof DISTANCES];
  }

  // Try to parse from name
  const normalized = distanceName.toLowerCase().trim();

  // Marathon
  if (normalized.includes('marathon') && !normalized.includes('half')) {
    return DISTANCES.Marathon;
  }
  if (
    normalized.includes('half') ||
    normalized.includes('21k') ||
    normalized.includes('21.1')
  ) {
    return DISTANCES['Half Marathon'];
  }

  // Numeric distances
  const kmMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k(?:m)?/i);
  if (kmMatch) {
    return Math.round(parseFloat(kmMatch[1]) * 1000);
  }

  const mileMatch = normalized.match(/(\d+(?:\.\d+)?)\s*mi(?:le)?/i);
  if (mileMatch) {
    return Math.round(parseFloat(mileMatch[1]) * 1609.34);
  }

  // Common names
  if (normalized.includes('5k') || normalized === '5000') return 5000;
  if (normalized.includes('10k') || normalized === '10000') return 10000;

  return null;
}

/**
 * Detect race type from distance name
 */
export function detectRaceType(distanceName: string): RaceType {
  const normalized = distanceName.toLowerCase();

  if (
    normalized.includes('triathlon') ||
    normalized.includes('ironman') ||
    normalized.includes('tri ')
  ) {
    return 'triathlon';
  }

  if (normalized.includes('duathlon')) {
    return 'duathlon';
  }

  if (normalized.includes('relay') || normalized.includes('ekiden')) {
    return 'relay';
  }

  if (
    normalized.includes('ultra') ||
    normalized.includes('50k') ||
    normalized.includes('50 mile') ||
    normalized.includes('100k') ||
    normalized.includes('100 mile')
  ) {
    return 'ultra';
  }

  return 'running';
}

/**
 * Normalize a checkpoint name for consistent storage
 */
export function normalizeCheckpointName(name: string): string {
  const normalized = name.toLowerCase().trim();

  // Standardize kilometer markers
  const kmMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:km|k)$/);
  if (kmMatch) {
    return `${kmMatch[1]}km`;
  }

  // Standardize mile markers
  const mileMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)$/);
  if (mileMatch) {
    return `${mileMatch[1]}mi`;
  }

  // Standardize transitions
  if (normalized === 't1' || normalized === 'transition 1') return 'T1';
  if (normalized === 't2' || normalized === 'transition 2') return 'T2';

  // Standardize disciplines
  if (normalized.includes('swim')) return 'swim';
  if (normalized.includes('bike') || normalized.includes('cycle')) return 'bike';
  if (normalized.includes('run') && !normalized.includes('run1') && !normalized.includes('run2')) {
    return 'run';
  }

  // Finish
  if (normalized === 'finish' || normalized === 'final' || normalized === 'end') {
    return 'finish';
  }

  return name;
}

/**
 * Get checkpoint type based on name
 */
export function getCheckpointType(
  name: string
): 'distance' | 'transition' | 'discipline' {
  const normalized = normalizeCheckpointName(name).toLowerCase();

  // Transitions
  if (normalized === 't1' || normalized === 't2') {
    return 'transition';
  }

  // Disciplines
  if (['swim', 'bike', 'run', 'run1', 'run2'].includes(normalized)) {
    return 'discipline';
  }

  // Everything else is a distance marker
  return 'distance';
}

/**
 * Validate checkpoint times are monotonically increasing
 */
export function validateCheckpointProgression(
  checkpoints: Array<{ cumulativeTime?: string; checkpointOrder: number }>
): boolean {
  const sorted = [...checkpoints].sort(
    (a, b) => a.checkpointOrder - b.checkpointOrder
  );

  let lastTime = 0;
  for (const cp of sorted) {
    if (!cp.cumulativeTime) continue;

    const time = parseTimeToSeconds(cp.cumulativeTime);
    if (time === null) continue;

    if (time < lastTime) {
      return false; // Time went backwards
    }
    lastTime = time;
  }

  return true;
}

/**
 * Parse time string to seconds
 */
function parseTimeToSeconds(time: string): number | null {
  if (!time) return null;

  // Handle HH:MM:SS or H:MM:SS or MM:SS or M:SS
  const parts = time.split(':').map((p) => parseFloat(p.trim()));

  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return null;
}

// ============================================
// World Records (for validation)
// ============================================

/**
 * World record times for validation (approximate, as of 2024)
 * Times in seconds
 */
export const WORLD_RECORDS: Record<
  string,
  { male: number; female: number }
> = {
  '5K': { male: 12 * 60 + 35, female: 14 * 60 + 0 }, // ~12:35 / ~14:00
  '10K': { male: 26 * 60 + 11, female: 28 * 60 + 54 }, // ~26:11 / ~28:54
  'Half Marathon': { male: 57 * 60 + 30, female: 63 * 60 + 44 }, // ~57:30 / ~1:03:44
  Marathon: { male: 2 * 3600 + 0 * 60 + 35, female: 2 * 3600 + 11 * 60 + 53 }, // ~2:00:35 / ~2:11:53
};

/**
 * Reasonable cutoff times for validation (generous limits)
 * Times in seconds
 */
export const REASONABLE_CUTOFFS: Record<string, number> = {
  '5K': 60 * 60, // 1 hour
  '10K': 2 * 60 * 60, // 2 hours
  'Half Marathon': 4 * 60 * 60, // 4 hours
  Marathon: 8 * 60 * 60, // 8 hours
  'Ultra 50K': 12 * 60 * 60, // 12 hours
  'Ultra 100K': 24 * 60 * 60, // 24 hours
  'Sprint Triathlon': 3 * 60 * 60, // 3 hours
  'Olympic Triathlon': 5 * 60 * 60, // 5 hours
  'Half Ironman': 9 * 60 * 60, // 9 hours
  Ironman: 17 * 60 * 60, // 17 hours
};
