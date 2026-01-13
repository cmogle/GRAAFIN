import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Database types (matching our schema)
export interface Database {
  public: {
    Tables: {
      athletes: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          normalized_name: string | null;
          gender: string | null;
          date_of_birth: string | null;
          country: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          normalized_name?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          country?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          normalized_name?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          country?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      events: {
        Row: {
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
        };
        Insert: {
          id?: string;
          organiser: string;
          event_name: string;
          event_date: string;
          event_url?: string | null;
          distance?: string | null;
          location?: string | null;
          scraped_at?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organiser?: string;
          event_name?: string;
          event_date?: string;
          event_url?: string | null;
          distance?: string | null;
          location?: string | null;
          scraped_at?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      race_results: {
        Row: {
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
        };
        Insert: {
          id?: string;
          event_id: string;
          athlete_id?: string | null;
          position?: number | null;
          bib_number?: string | null;
          name: string;
          normalized_name?: string | null;
          gender?: string | null;
          category?: string | null;
          finish_time?: string | null;
          pace?: string | null;
          gender_position?: number | null;
          category_position?: number | null;
          country?: string | null;
          time_5km?: string | null;
          time_10km?: string | null;
          time_13km?: string | null;
          time_15km?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          athlete_id?: string | null;
          position?: number | null;
          bib_number?: string | null;
          name?: string;
          normalized_name?: string | null;
          gender?: string | null;
          category?: string | null;
          finish_time?: string | null;
          pace?: string | null;
          gender_position?: number | null;
          category_position?: number | null;
          country?: string | null;
          time_5km?: string | null;
          time_10km?: string | null;
          time_13km?: string | null;
          time_15km?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      athlete_follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          created_at?: string;
        };
      };
      scrape_jobs: {
        Row: {
          id: string;
          organiser: string;
          event_url: string;
          status: string;
          results_count: number | null;
          error_message: string | null;
          started_by: string | null;
          started_at: string;
          completed_at: string | null;
          retry_count: number;
          max_retries: number;
          next_retry_at: string | null;
          notification_sent: boolean;
        };
        Insert: {
          id?: string;
          organiser: string;
          event_url: string;
          status?: string;
          results_count?: number | null;
          error_message?: string | null;
          started_by?: string | null;
          started_at?: string;
          completed_at?: string | null;
          retry_count?: number;
          max_retries?: number;
          next_retry_at?: string | null;
          notification_sent?: boolean;
        };
        Update: {
          id?: string;
          organiser?: string;
          event_url?: string;
          status?: string;
          results_count?: number | null;
          error_message?: string | null;
          started_by?: string | null;
          started_at?: string;
          completed_at?: string | null;
          retry_count?: number;
          max_retries?: number;
          next_retry_at?: string | null;
          notification_sent?: boolean;
        };
      };
      monitored_endpoints: {
        Row: {
          id: string;
          organiser: string;
          endpoint_url: string;
          name: string;
          enabled: boolean;
          check_interval_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organiser: string;
          endpoint_url: string;
          name: string;
          enabled?: boolean;
          check_interval_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organiser?: string;
          endpoint_url?: string;
          name?: string;
          enabled?: boolean;
          check_interval_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      endpoint_status_history: {
        Row: {
          id: string;
          endpoint_id: string;
          status: string;
          status_code: number | null;
          response_time_ms: number | null;
          has_results: boolean;
          error_message: string | null;
          checked_at: string;
        };
        Insert: {
          id?: string;
          endpoint_id: string;
          status: string;
          status_code?: number | null;
          response_time_ms?: number | null;
          has_results?: boolean;
          error_message?: string | null;
          checked_at?: string;
        };
        Update: {
          id?: string;
          endpoint_id?: string;
          status?: string;
          status_code?: number | null;
          response_time_ms?: number | null;
          has_results?: boolean;
          error_message?: string | null;
          checked_at?: string;
        };
      };
      endpoint_status_current: {
        Row: {
          endpoint_id: string;
          status: string;
          status_code: number | null;
          response_time_ms: number | null;
          has_results: boolean;
          last_checked: string;
          last_status_change: string;
          consecutive_failures: number;
        };
        Insert: {
          endpoint_id: string;
          status: string;
          status_code?: number | null;
          response_time_ms?: number | null;
          has_results?: boolean;
          last_checked?: string;
          last_status_change?: string;
          consecutive_failures?: number;
        };
        Update: {
          endpoint_id?: string;
          status?: string;
          status_code?: number | null;
          response_time_ms?: number | null;
          has_results?: boolean;
          last_checked?: string;
          last_status_change?: string;
          consecutive_failures?: number;
        };
      };
      profile_claims: {
        Row: any;
        Insert: any;
        Update: any;
      };
      strava_links: {
        Row: any;
        Insert: any;
        Update: any;
      };
      hidden_results: {
        Row: any;
        Insert: any;
        Update: any;
      };
      athlete_merges: {
        Row: any;
        Insert: any;
        Update: any;
      };
      leagues: {
        Row: any;
        Insert: any;
        Update: any;
      };
      league_rankings: {
        Row: any;
        Insert: any;
        Update: any;
      };
      watchlists: {
        Row: any;
        Insert: any;
        Update: any;
      };
      watchlist_items: {
        Row: any;
        Insert: any;
        Update: any;
      };
      watchlist_notifications: {
        Row: any;
        Insert: any;
        Update: any;
      };
    };
  };
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

// Create Supabase client with service role key (for backend operations)
export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper function to create a client for user operations (with user's JWT)
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured');
  }
  return createClient<Database>(supabaseUrl, accessToken, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  });
}

// Helper function to normalize names for matching
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize whitespace
}
