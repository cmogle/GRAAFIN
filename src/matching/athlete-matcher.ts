import Fuse from 'fuse.js';
import { normalizeName } from '../db/supabase.js';
import { getUnmatchedResults, searchAthletes, linkResultToAthlete, type RaceResultRow, type Athlete } from '../storage/supabase.js';

interface MatchCandidate {
  athlete: Athlete;
  result: RaceResultRow;
  score: number;
  confidence: number;
}

/**
 * Find potential athlete matches for a race result
 */
export async function findMatchesForResult(
  result: RaceResultRow,
  threshold: number = 0.6
): Promise<MatchCandidate[]> {
  // Search for athletes with similar normalized names
  const normalizedResultName = normalizeName(result.name);
  
  // Get all athletes for fuzzy matching
  const allAthletes = await searchAthletes(result.name, 50);
  
  if (allAthletes.length === 0) {
    return [];
  }

  // Use Fuse.js for fuzzy matching
  const fuse = new Fuse(allAthletes, {
    keys: ['normalized_name', 'name'],
    threshold,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const matches = fuse.search(normalizedResultName);
  
  return matches
    .filter((match) => match.score !== undefined && match.score < threshold)
    .map((match) => ({
      athlete: match.item,
      result,
      score: match.score || 1,
      confidence: Math.round((1 - (match.score || 1)) * 100),
    }));
}

/**
 * Find all unmatched results and suggest matches
 */
export async function findMatchesForUnmatchedResults(
  eventId?: string,
  threshold: number = 0.6
): Promise<Map<string, MatchCandidate[]>> {
  const unmatchedResults = await getUnmatchedResults(eventId);
  const matchesMap = new Map<string, MatchCandidate[]>();

  for (const result of unmatchedResults) {
    const matches = await findMatchesForResult(result, threshold);
    if (matches.length > 0) {
      matchesMap.set(result.id, matches);
    }
  }

  return matchesMap;
}

/**
 * Link a result to an athlete
 */
export async function linkResult(resultId: string, athleteId: string): Promise<void> {
  await linkResultToAthlete(resultId, athleteId);
}

/**
 * Auto-match results based on name similarity
 * This will automatically link results where confidence is very high
 */
export async function autoMatchResults(
  confidenceThreshold: number = 90,
  eventId?: string
): Promise<{ matched: number; skipped: number }> {
  const unmatchedResults = await getUnmatchedResults(eventId);
  let matched = 0;
  let skipped = 0;

  for (const result of unmatchedResults) {
    const matches = await findMatchesForResult(result, 0.3); // Lower threshold for auto-match
    
    // Only auto-match if there's exactly one high-confidence match
    if (matches.length === 1 && matches[0].confidence >= confidenceThreshold) {
      await linkResult(result.id, matches[0].athlete.id);
      matched++;
    } else {
      skipped++;
    }
  }

  return { matched, skipped };
}

/**
 * Suggest matches for a specific athlete
 */
export async function suggestMatchesForAthlete(
  athleteId: string,
  threshold: number = 0.6
): Promise<MatchCandidate[]> {
  const { getAthleteById } = await import('../storage/supabase.js');
  const athlete = await getAthleteById(athleteId);
  
  if (!athlete) {
    return [];
  }

  const unmatchedResults = await getUnmatchedResults();
  const candidates: MatchCandidate[] = [];

  for (const result of unmatchedResults) {
    const normalizedResultName = normalizeName(result.name);
    const normalizedAthleteName = normalizeName(athlete.name);

    // Simple string similarity check
    if (normalizedResultName.includes(normalizedAthleteName) || 
        normalizedAthleteName.includes(normalizedResultName)) {
      // Use Fuse for more accurate scoring
      const fuse = new Fuse([result], {
        keys: ['normalized_name', 'name'],
        threshold,
        includeScore: true,
      });

      const matches = fuse.search(normalizedAthleteName);
      if (matches.length > 0 && matches[0].score !== undefined && matches[0].score < threshold) {
        candidates.push({
          athlete,
          result,
          score: matches[0].score || 1,
          confidence: Math.round((1 - (matches[0].score || 1)) * 100),
        });
      }
    }
  }

  return candidates.sort((a, b) => a.score - b.score);
}
