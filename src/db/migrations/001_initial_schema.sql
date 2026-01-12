-- Initial database schema for Athlete Performance Platform
-- This migration is idempotent - safe to run multiple times

-- Core athlete profiles
CREATE TABLE IF NOT EXISTS athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE,
  name text NOT NULL,
  normalized_name text,
  gender text,
  date_of_birth date,
  country text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Race events from different organisers
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser text NOT NULL,
  event_name text NOT NULL,
  event_date date NOT NULL,
  event_url text,
  distance text,
  location text,
  scraped_at timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Individual race results
CREATE TABLE IF NOT EXISTS race_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  athlete_id uuid REFERENCES athletes(id) ON DELETE SET NULL,
  position integer,
  bib_number text,
  name text NOT NULL,
  normalized_name text,
  gender text,
  category text,
  finish_time text,
  pace text,
  gender_position integer,
  category_position integer,
  country text,
  time_5km text,
  time_10km text,
  time_13km text,
  time_15km text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Athlete following system
CREATE TABLE IF NOT EXISTS athlete_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES athletes(id) ON DELETE CASCADE,
  following_id uuid REFERENCES athletes(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Scraping job tracking
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser text NOT NULL,
  event_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  results_count integer,
  error_message text,
  started_by uuid REFERENCES auth.users(id),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_athletes_user_id ON athletes(user_id);
CREATE INDEX IF NOT EXISTS idx_athletes_normalized_name ON athletes(normalized_name);
CREATE INDEX IF NOT EXISTS idx_events_organiser ON events(organiser);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_race_results_event_id ON race_results(event_id);
CREATE INDEX IF NOT EXISTS idx_race_results_athlete_id ON race_results(athlete_id);
CREATE INDEX IF NOT EXISTS idx_race_results_normalized_name ON race_results(normalized_name);
CREATE INDEX IF NOT EXISTS idx_athlete_follows_follower ON athlete_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_athlete_follows_following ON athlete_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_athletes_updated_at ON athletes;
CREATE TRIGGER update_athletes_updated_at BEFORE UPDATE ON athletes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Athletes are viewable by everyone" ON athletes;
DROP POLICY IF EXISTS "Users can update their own athlete profile" ON athletes;
DROP POLICY IF EXISTS "Users can insert their own athlete profile" ON athletes;
DROP POLICY IF EXISTS "Events are viewable by everyone" ON events;
DROP POLICY IF EXISTS "Race results are viewable by everyone" ON race_results;
DROP POLICY IF EXISTS "Users can view all follows" ON athlete_follows;
DROP POLICY IF EXISTS "Users can create their own follows" ON athlete_follows;
DROP POLICY IF EXISTS "Users can delete their own follows" ON athlete_follows;
DROP POLICY IF EXISTS "Scrape jobs are viewable by authenticated users" ON scrape_jobs;

-- Athletes: Users can read all, update their own
CREATE POLICY "Athletes are viewable by everyone" ON athletes
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own athlete profile" ON athletes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own athlete profile" ON athletes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Events: Public read, admin write
CREATE POLICY "Events are viewable by everyone" ON events
  FOR SELECT USING (true);

-- Race results: Public read
CREATE POLICY "Race results are viewable by everyone" ON race_results
  FOR SELECT USING (true);

-- Athlete follows: Users can manage their own follows
CREATE POLICY "Users can view all follows" ON athlete_follows
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own follows" ON athlete_follows
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM athletes
      WHERE id = follower_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own follows" ON athlete_follows
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM athletes
      WHERE id = follower_id AND user_id = auth.uid()
    )
  );

-- Scrape jobs: Admin only (will be handled via service role key in backend)
CREATE POLICY "Scrape jobs are viewable by authenticated users" ON scrape_jobs
  FOR SELECT USING (auth.role() = 'authenticated');
