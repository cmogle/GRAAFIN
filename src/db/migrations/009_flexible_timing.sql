-- Migration: 009_flexible_timing.sql
-- Purpose: Add flexible timing checkpoints, event distances, multi-source reconciliation support
-- Date: 2026-01-13

-- ============================================
-- 1. Flexible timing checkpoints table
-- Replaces hardcoded time_5km, time_10km, etc. fields
-- Supports any checkpoint type: distance markers, transitions (T1/T2), disciplines (swim/bike/run)
-- ============================================
CREATE TABLE IF NOT EXISTS timing_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES race_results(id) ON DELETE CASCADE,
  checkpoint_type text NOT NULL,  -- 'distance' | 'transition' | 'discipline'
  checkpoint_name text NOT NULL,  -- e.g., '5km', '21.1km', 'T1', 'swim', 'bike'
  checkpoint_order integer NOT NULL,  -- Order in the race (1, 2, 3...)
  split_time text,  -- Time for this segment only
  cumulative_time text,  -- Total elapsed time at this point
  pace text,  -- Pace at this checkpoint (e.g., '5:30/km')
  segment_distance_meters integer,  -- Distance of this segment
  metadata jsonb,  -- Additional data (heart rate, elevation, etc.)
  created_at timestamptz DEFAULT now(),

  UNIQUE(result_id, checkpoint_name)
);

CREATE INDEX IF NOT EXISTS idx_timing_checkpoints_result ON timing_checkpoints(result_id);
CREATE INDEX IF NOT EXISTS idx_timing_checkpoints_type ON timing_checkpoints(checkpoint_type);

-- ============================================
-- 2. Event distances table
-- Track multiple distances offered at each event (5K, 10K, Half, Full, Sprint Tri, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS event_distances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  distance_name text NOT NULL,  -- '5K', '10K', 'Half Marathon', 'Marathon', 'Sprint Triathlon'
  distance_meters integer NOT NULL,  -- 5000, 10000, 21097, 42195, etc.
  race_type text NOT NULL DEFAULT 'running',  -- 'running' | 'triathlon' | 'duathlon' | 'ultra' | 'relay'
  expected_checkpoints jsonb,  -- Expected timing points for this distance
  participant_count integer,  -- Number of participants in this distance
  metadata jsonb,  -- Additional distance-specific data
  created_at timestamptz DEFAULT now(),

  UNIQUE(event_id, distance_name)
);

CREATE INDEX IF NOT EXISTS idx_event_distances_event ON event_distances(event_id);
CREATE INDEX IF NOT EXISTS idx_event_distances_race_type ON event_distances(race_type);

-- ============================================
-- 3. Result sources table
-- Track data provenance for multi-source reconciliation
-- Know which organiser/source provided which data fields
-- ============================================
CREATE TABLE IF NOT EXISTS result_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES race_results(id) ON DELETE CASCADE,
  source_organiser text NOT NULL,  -- 'hopasports', 'evochip', etc.
  source_url text NOT NULL,  -- URL where data was scraped from
  scraped_at timestamptz NOT NULL,
  fields_provided jsonb NOT NULL,  -- ['position', 'finish_time', 'time_5km', ...]
  confidence_score integer,  -- 0-100, quality/reliability score
  is_primary boolean DEFAULT false,  -- Is this the primary data source?
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_result_sources_result ON result_sources(result_id);
CREATE INDEX IF NOT EXISTS idx_result_sources_organiser ON result_sources(source_organiser);

-- ============================================
-- 4. Event source links table
-- Link same event from multiple timing providers (e.g., HopaSports + EvoChip)
-- ============================================
CREATE TABLE IF NOT EXISTS event_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  linked_event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'same_event',  -- 'same_event' | 'related' | 'series'
  link_confidence integer NOT NULL DEFAULT 100,  -- 0-100
  linked_by uuid,  -- User who created the link (NULL if auto-detected)
  notes text,  -- Optional notes about the link
  created_at timestamptz DEFAULT now(),

  UNIQUE(primary_event_id, linked_event_id),
  CHECK (primary_event_id != linked_event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_source_links_primary ON event_source_links(primary_event_id);
CREATE INDEX IF NOT EXISTS idx_event_source_links_linked ON event_source_links(linked_event_id);

-- ============================================
-- 5. Enhance race_results table
-- Add new columns for richer data capture
-- ============================================

-- Link to specific distance within an event
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS distance_id uuid REFERENCES event_distances(id);

-- Gun time (gross time from official start gun)
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS gun_time text;

-- Chip time (net time from chip crossing start mat)
-- Note: finish_time currently stores this, chip_time is explicit
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS chip_time text;

-- Time behind the winner
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS time_behind text;

-- Athlete age at race time
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS age integer;

-- Running club affiliation
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS club text;

-- Race status (finished, DNF, DNS, DQ)
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS status text DEFAULT 'finished';

-- Validation tracking
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS validation_errors jsonb;

-- New indexes for enhanced columns
CREATE INDEX IF NOT EXISTS idx_race_results_distance ON race_results(distance_id);
CREATE INDEX IF NOT EXISTS idx_race_results_status ON race_results(status);
CREATE INDEX IF NOT EXISTS idx_race_results_club ON race_results(club) WHERE club IS NOT NULL;

-- ============================================
-- 6. Row Level Security policies for new tables
-- ============================================

-- Enable RLS on new tables
ALTER TABLE timing_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_distances ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_source_links ENABLE ROW LEVEL SECURITY;

-- timing_checkpoints: Public read access
CREATE POLICY "timing_checkpoints_select" ON timing_checkpoints
  FOR SELECT USING (true);

-- timing_checkpoints: Service role can insert/update/delete
CREATE POLICY "timing_checkpoints_service" ON timing_checkpoints
  FOR ALL USING (auth.role() = 'service_role');

-- event_distances: Public read access
CREATE POLICY "event_distances_select" ON event_distances
  FOR SELECT USING (true);

-- event_distances: Service role can insert/update/delete
CREATE POLICY "event_distances_service" ON event_distances
  FOR ALL USING (auth.role() = 'service_role');

-- result_sources: Public read access
CREATE POLICY "result_sources_select" ON result_sources
  FOR SELECT USING (true);

-- result_sources: Service role can insert/update/delete
CREATE POLICY "result_sources_service" ON result_sources
  FOR ALL USING (auth.role() = 'service_role');

-- event_source_links: Public read access
CREATE POLICY "event_source_links_select" ON event_source_links
  FOR SELECT USING (true);

-- event_source_links: Authenticated users can create links
CREATE POLICY "event_source_links_insert" ON event_source_links
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- event_source_links: Service role can update/delete
CREATE POLICY "event_source_links_service" ON event_source_links
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 7. Comments for documentation
-- ============================================
COMMENT ON TABLE timing_checkpoints IS 'Flexible timing checkpoints for race results - supports distance markers, transitions, disciplines';
COMMENT ON TABLE event_distances IS 'Distances offered at each event with expected checkpoints';
COMMENT ON TABLE result_sources IS 'Data provenance tracking for multi-source reconciliation';
COMMENT ON TABLE event_source_links IS 'Links between same event from different timing providers';

COMMENT ON COLUMN race_results.distance_id IS 'Reference to specific distance within the event';
COMMENT ON COLUMN race_results.gun_time IS 'Gross time from official start gun';
COMMENT ON COLUMN race_results.chip_time IS 'Net time from chip crossing start mat';
COMMENT ON COLUMN race_results.status IS 'Race status: finished, dnf (did not finish), dns (did not start), dq (disqualified)';
