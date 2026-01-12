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
        };
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
