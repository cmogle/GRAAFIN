import { supabase, normalizeName, type Database } from '../db/supabase.js';
import type { RaceResult } from '../types.js';

export type Athlete = Database['public']['Tables']['athletes']['Row'];
type Event = Database['public']['Tables']['events']['Row'];
export type RaceResultRow = Database['public']['Tables']['race_results']['Row'];
export type ScrapeJob = Database['public']['Tables']['scrape_jobs']['Row'];

// Event storage functions
export async function saveEvent(event: {
  organiser: string;
  eventName: string;
  eventDate: string;
  eventUrl?: string;
  distance?: string;
  location?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      organiser: event.organiser,
      event_name: event.eventName,
      event_date: event.eventDate,
      event_url: event.eventUrl || null,
      distance: event.distance || null,
      location: event.location || null,
      scraped_at: new Date().toISOString(),
      metadata: event.metadata || null,
    } as any)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to save event: ${error.message}`);
  }

  return (data as any).id;
}

export async function getEventByUrl(eventUrl: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_url', eventUrl)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get event: ${error.message}`);
  }

  return data;
}

export async function getEventById(eventId: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get event: ${error.message}`);
  }

  return data;
}

// Race results storage functions
export async function saveResults(
  eventId: string,
  results: RaceResult[],
  distance: string
): Promise<number> {
  if (results.length === 0) {
    return 0;
  }

  const resultsToInsert = results.map((result) => ({
    event_id: eventId,
    athlete_id: null, // Will be matched later
    position: result.position,
    bib_number: result.bibNumber || null,
    name: result.name,
    normalized_name: normalizeName(result.name),
    gender: result.gender || null,
    category: result.category || null,
    finish_time: result.finishTime || null,
    pace: result.pace || null,
    gender_position: result.genderPosition || null,
    category_position: result.categoryPosition || null,
    country: result.country || null,
    time_5km: result.time5km || null,
    time_10km: result.time10km || null,
    time_13km: result.time13km || null,
    time_15km: result.time15km || null,
    metadata: {
      distance,
    },
  }));

  // Insert in batches to avoid payload size limits
  const batchSize = 500;
  let totalInserted = 0;

  for (let i = 0; i < resultsToInsert.length; i += batchSize) {
    const batch = resultsToInsert.slice(i, i + batchSize);
    const { error } = await supabase.from('race_results').insert(batch as any);

    if (error) {
      throw new Error(`Failed to save results batch: ${error.message}`);
    }

    totalInserted += batch.length;
  }

  return totalInserted;
}

export async function getAthleteResults(athleteId: string): Promise<RaceResultRow[]> {
  const { data, error } = await supabase
    .from('race_results')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get athlete results: ${error.message}`);
  }

  return data || [];
}

export async function getUnmatchedResults(eventId?: string): Promise<RaceResultRow[]> {
  let query = supabase
    .from('race_results')
    .select('*')
    .is('athlete_id', null);

  if (eventId) {
    query = query.eq('event_id', eventId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get unmatched results: ${error.message}`);
  }

  return data || [];
}

export async function linkResultToAthlete(resultId: string, athleteId: string): Promise<void> {
  const { error } = await supabase
    .from('race_results')
    // @ts-ignore - Supabase type inference issue
    .update({ athlete_id: athleteId })
    .eq('id', resultId);

  if (error) {
    throw new Error(`Failed to link result to athlete: ${error.message}`);
  }
}

export async function unlinkResultFromAthlete(resultId: string): Promise<void> {
  const { error } = await supabase
    .from('race_results')
    // @ts-ignore - Supabase type inference issue
    .update({ athlete_id: null })
    .eq('id', resultId);

  if (error) {
    throw new Error(`Failed to unlink result from athlete: ${error.message}`);
  }
}

// Athlete functions
export async function createAthlete(athlete: {
  userId?: string;
  name: string;
  gender?: string;
  dateOfBirth?: string;
  country?: string;
}): Promise<Athlete> {
  const { data, error } = await supabase
    .from('athletes')
    .insert({
      user_id: athlete.userId || null,
      name: athlete.name,
      normalized_name: normalizeName(athlete.name),
      gender: athlete.gender || null,
      date_of_birth: athlete.dateOfBirth || null,
      country: athlete.country || null,
    } as any)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create athlete: ${error.message}`);
  }

  return data;
}

export async function getAthleteById(athleteId: string): Promise<Athlete | null> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('id', athleteId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get athlete: ${error.message}`);
  }

  return data;
}

export async function getAthleteByUserId(userId: string): Promise<Athlete | null> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get athlete by user ID: ${error.message}`);
  }

  return data;
}

export async function searchAthletes(query: string, limit: number = 20): Promise<Athlete[]> {
  const normalizedQuery = normalizeName(query);

  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .ilike('normalized_name', `%${normalizedQuery}%`)
    .limit(limit);

  if (error) {
    throw new Error(`Failed to search athletes: ${error.message}`);
  }

  return data || [];
}

export async function updateAthlete(
  athleteId: string,
  updates: {
    name?: string;
    gender?: string;
    dateOfBirth?: string;
    country?: string;
  }
): Promise<Athlete> {
  const updateData: Record<string, unknown> = {};

  if (updates.name) {
    updateData.name = updates.name;
    updateData.normalized_name = normalizeName(updates.name);
  }
  if (updates.gender !== undefined) updateData.gender = updates.gender;
  if (updates.dateOfBirth !== undefined) updateData.date_of_birth = updates.dateOfBirth;
  if (updates.country !== undefined) updateData.country = updates.country;

  const { data, error } = await supabase
    .from('athletes')
    // @ts-ignore - Supabase type inference issue
    .update(updateData)
    .eq('id', athleteId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update athlete: ${error.message}`);
  }

  return data;
}

// Scrape job functions
export async function createScrapeJob(job: {
  organiser: string;
  eventUrl: string;
  startedBy?: string;
}): Promise<ScrapeJob> {
  const { data, error } = await supabase
    .from('scrape_jobs')
    .insert({
      organiser: job.organiser,
      event_url: job.eventUrl,
      status: 'pending',
      started_by: job.startedBy || null,
    } as any)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create scrape job: ${error.message}`);
  }

  return data;
}

export async function updateScrapeJob(
  jobId: string,
  updates: {
    status?: 'pending' | 'running' | 'completed' | 'failed';
    resultsCount?: number;
    errorMessage?: string;
  }
): Promise<ScrapeJob> {
  const updateData: Record<string, unknown> = {};

  if (updates.status) {
    updateData.status = updates.status;
    if (updates.status === 'completed' || updates.status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }
  }
  if (updates.resultsCount !== undefined) updateData.results_count = updates.resultsCount;
  if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;

  const { data, error } = await supabase
    .from('scrape_jobs')
    // @ts-ignore - Supabase type inference issue
    .update(updateData)
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update scrape job: ${error.message}`);
  }

  return data;
}

export async function getScrapeJob(jobId: string): Promise<ScrapeJob | null> {
  const { data, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get scrape job: ${error.message}`);
  }

  return data;
}

export async function getScrapeJobs(limit: number = 50): Promise<ScrapeJob[]> {
  const { data, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get scrape jobs: ${error.message}`);
  }

  return data || [];
}
