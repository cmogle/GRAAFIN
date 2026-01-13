export interface RaceResult {
  position: number;
  bibNumber: string;
  name: string;
  gender: string;
  category: string;
  finishTime: string;
  pace?: string;
  genderPosition?: number;
  categoryPosition?: number;
  country?: string;
  time5km?: string;
  time10km?: string;
  time13km?: string;
  time15km?: string;
}

export interface RaceData {
  eventName: string;
  eventDate: string;
  url: string;
  scrapedAt: string;
  categories: {
    halfMarathon: RaceResult[];
    tenKm: RaceResult[];
  };
}

export interface MonitorState {
  lastStatus: 'up' | 'down' | 'unknown';
  lastChecked: string;
  lastStatusChange: string;
  consecutiveFailures: number;
}

export interface SiteStatus {
  isUp: boolean;
  statusCode: number;
  responseTime: number;
  hasResults: boolean;
  error?: string;
}

export interface SearchResult {
  result: RaceResult;
  raceType: 'halfMarathon' | 'tenKm';
  score: number;
}

export interface Config {
  targetUrl: string;
  pollIntervalMs: number;
  twilio: {
    accountSid: string;
    authToken: string;
    whatsappFrom: string;
  };
  notifyWhatsapp: string;
}

// Event identifier type
export type EventId = 'dcs' | 'plus500';

// New types for athlete platform
export interface Athlete {
  id: string;
  userId: string | null;
  name: string;
  normalizedName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  organiser: string;
  eventName: string;
  eventDate: string;
  eventUrl: string | null;
  distance: string | null;
  location: string | null;
  scrapedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RaceResultRow {
  id: string;
  eventId: string;
  athleteId: string | null;
  position: number | null;
  bibNumber: string | null;
  name: string;
  normalizedName: string | null;
  gender: string | null;
  category: string | null;
  finishTime: string | null;
  pace: string | null;
  genderPosition: number | null;
  categoryPosition: number | null;
  country: string | null;
  time5km: string | null;
  time10km: string | null;
  time13km: string | null;
  time15km: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ScrapeJob {
  id: string;
  organiser: string;
  eventUrl: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  resultsCount: number | null;
  errorMessage: string | null;
  startedBy: string | null;
  startedAt: string;
  completedAt: string | null;
}

export type Organiser = 'hopasports' | 'evochip' | string;

// Database row types (snake_case - matches Supabase/PostgreSQL)
export interface DbRaceResultRow {
  id: string;
  event_id: string;
  athlete_id: string | null;
  position: number | null;
  bib_number: string | null;
  name: string;
  normalized_name: string | null;
  gender: string | null;
  category: string | null;
  finish_time: string | null;
  pace: string | null;
  gender_position: number | null;
  category_position: number | null;
  country: string | null;
  time_5km: string | null;
  time_10km: string | null;
  time_13km: string | null;
  time_15km: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbEventRow {
  id: string;
  organiser: string;
  event_name: string;
  event_date: string;
  event_url: string | null;
  distance: string | null;
  location: string | null;
  scraped_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbAthleteRow {
  id: string;
  user_id: string | null;
  name: string;
  normalized_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  country: string | null;
  strava_athlete_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}
