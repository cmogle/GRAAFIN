import { getAthleteResults } from '../storage/supabase.js';
import type { RaceResultRow } from '../types.js';

export interface PerformanceStats {
  totalRaces: number;
  personalBests: {
    fastestTime: string | null;
    fastestEvent: string | null;
    fastestDate: string | null;
  };
  improvements: {
    bestImprovement: number | null; // seconds
    averageImprovement: number | null;
  };
  categoryRankings: {
    averageRank: number;
    bestRank: number;
    worstRank: number;
  };
  recentTrend: 'improving' | 'declining' | 'stable';
}

export interface PerformanceTrend {
  date: string;
  eventName: string;
  finishTime: string;
  timeInSeconds: number | null;
  position: number | null;
  categoryPosition: number | null;
}

/**
 * Parse time string (HH:MM:SS or MM:SS) to seconds
 */
function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr || timeStr === '-' || timeStr === '') {
    return null;
  }

  const parts = timeStr.split(':').map(Number);
  
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }

  return null;
}

/**
 * Calculate performance statistics for an athlete
 */
export async function calculatePerformanceStats(athleteId: string): Promise<PerformanceStats> {
  const results = await getAthleteResults(athleteId);

  if (results.length === 0) {
    return {
      totalRaces: 0,
      personalBests: {
        fastestTime: null,
        fastestEvent: null,
        fastestDate: null,
      },
      improvements: {
        bestImprovement: null,
        averageImprovement: null,
      },
      categoryRankings: {
        averageRank: 0,
        bestRank: 0,
        worstRank: 0,
      },
      recentTrend: 'stable',
    };
  }

  // Sort by date (most recent first)
  const sortedResults = [...results].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  // Find personal best (fastest time)
  let fastestTime: string | null = null;
  let fastestEvent: string | null = null;
  let fastestDate: string | null = null;
  let fastestSeconds: number | null = null;

  for (const result of sortedResults) {
    if (result.finish_time) {
      const seconds = parseTimeToSeconds(result.finish_time);
      if (seconds !== null) {
        if (fastestSeconds === null || seconds < fastestSeconds) {
          fastestSeconds = seconds;
          fastestTime = result.finish_time;
          fastestEvent = result.id; // We'd need to join with events table for name
          fastestDate = result.created_at;
        }
      }
    }
  }

  // Calculate improvements
  const timesWithSeconds = sortedResults
    .map((r) => ({
      result: r,
      seconds: r.finish_time ? parseTimeToSeconds(r.finish_time) : null,
    }))
    .filter((t) => t.seconds !== null)
    .reverse(); // Oldest first for improvement calculation

  let bestImprovement: number | null = null;
  const improvements: number[] = [];

  for (let i = 1; i < timesWithSeconds.length; i++) {
    const prev = timesWithSeconds[i - 1];
    const curr = timesWithSeconds[i];

    if (prev.seconds !== null && curr.seconds !== null) {
      const improvement = prev.seconds - curr.seconds; // Positive = faster
      improvements.push(improvement);
      if (bestImprovement === null || improvement > bestImprovement) {
        bestImprovement = improvement;
      }
    }
  }

  const averageImprovement =
    improvements.length > 0
      ? improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length
      : null;

  // Category rankings
  const categoryPositions = sortedResults
    .map((r) => r.category_position)
    .filter((pos): pos is number => pos !== null);

  const averageRank =
    categoryPositions.length > 0
      ? categoryPositions.reduce((sum, rank) => sum + rank, 0) / categoryPositions.length
      : 0;
  const bestRank = categoryPositions.length > 0 ? Math.min(...categoryPositions) : 0;
  const worstRank = categoryPositions.length > 0 ? Math.max(...categoryPositions) : 0;

  // Recent trend (last 3 races)
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (timesWithSeconds.length >= 3) {
    const recent = timesWithSeconds.slice(-3);
    const first = recent[0].seconds;
    const last = recent[recent.length - 1].seconds;

    if (first !== null && last !== null) {
      const diff = first - last; // Positive = improving (faster)
      if (diff > 30) {
        recentTrend = 'improving';
      } else if (diff < -30) {
        recentTrend = 'declining';
      }
    }
  }

  return {
    totalRaces: results.length,
    personalBests: {
      fastestTime,
      fastestEvent,
      fastestDate,
    },
    improvements: {
      bestImprovement,
      averageImprovement,
    },
    categoryRankings: {
      averageRank: Math.round(averageRank * 10) / 10,
      bestRank,
      worstRank,
    },
    recentTrend,
  };
}

/**
 * Get performance trends over time
 */
export async function getPerformanceTrends(athleteId: string): Promise<PerformanceTrend[]> {
  const results = await getAthleteResults(athleteId);

  // Sort by date (oldest first)
  const sortedResults = [...results].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateA - dateB;
  });

  return sortedResults.map((result) => ({
    date: result.created_at,
    eventName: result.id, // Would need to join with events for name
    finishTime: result.finish_time || '',
    timeInSeconds: result.finish_time ? parseTimeToSeconds(result.finish_time) : null,
    position: result.position,
    categoryPosition: result.category_position,
  }));
}

/**
 * Compare athlete performance to category average
 */
export async function compareToCategory(
  athleteId: string,
  category: string
): Promise<{
  athleteAverage: number | null;
  categoryAverage: number | null;
  percentile: number | null;
}> {
  const results = await getAthleteResults(athleteId);
  const categoryResults = results.filter((r) => r.category === category);

  if (categoryResults.length === 0) {
    return {
      athleteAverage: null,
      categoryAverage: null,
      percentile: null,
    };
  }

  // Calculate athlete average time
  const athleteTimes = categoryResults
    .map((r) => (r.finish_time ? parseTimeToSeconds(r.finish_time) : null))
    .filter((t): t is number => t !== null);

  const athleteAverage =
    athleteTimes.length > 0 ? athleteTimes.reduce((sum, t) => sum + t, 0) / athleteTimes.length : null;

  // For MVP, we'll return basic stats
  // In a full implementation, we'd query all results in the category from the database
  return {
    athleteAverage,
    categoryAverage: null, // Would need to query all category results
    percentile: null, // Would need full category data
  };
}
