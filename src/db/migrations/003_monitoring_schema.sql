-- Monitoring schema for GRAAFIN
-- This migration adds endpoint monitoring capabilities

-- Endpoint monitoring configuration
CREATE TABLE IF NOT EXISTS monitored_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser text NOT NULL,
  endpoint_url text NOT NULL,
  name text NOT NULL,
  enabled boolean DEFAULT true,
  check_interval_minutes integer DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organiser, endpoint_url)
);

-- Monitoring status history
CREATE TABLE IF NOT EXISTS endpoint_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid REFERENCES monitored_endpoints(id) ON DELETE CASCADE,
  status text NOT NULL,
  status_code integer,
  response_time_ms integer,
  has_results boolean,
  error_message text,
  checked_at timestamptz DEFAULT now()
);

-- Current monitoring state (for quick lookups)
CREATE TABLE IF NOT EXISTS endpoint_status_current (
  endpoint_id uuid PRIMARY KEY REFERENCES monitored_endpoints(id) ON DELETE CASCADE,
  status text NOT NULL,
  status_code integer,
  response_time_ms integer,
  has_results boolean,
  last_checked timestamptz DEFAULT now(),
  last_status_change timestamptz DEFAULT now(),
  consecutive_failures integer DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_monitored_endpoints_organiser ON monitored_endpoints(organiser);
CREATE INDEX IF NOT EXISTS idx_monitored_endpoints_enabled ON monitored_endpoints(enabled);
CREATE INDEX IF NOT EXISTS idx_endpoint_status_history_endpoint_id ON endpoint_status_history(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_status_history_checked_at ON endpoint_status_history(checked_at);
CREATE INDEX IF NOT EXISTS idx_endpoint_status_history_status ON endpoint_status_history(status);

-- Function to update updated_at timestamp for monitored_endpoints
CREATE TRIGGER update_monitored_endpoints_updated_at BEFORE UPDATE ON monitored_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE monitored_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_status_current ENABLE ROW LEVEL SECURITY;

-- Monitored endpoints: Admin only (handled via service role in backend)
CREATE POLICY "Monitored endpoints are viewable by authenticated users" ON monitored_endpoints
  FOR SELECT USING (auth.role() = 'authenticated');

-- Status history: Public read (for admin dashboard)
CREATE POLICY "Status history is viewable by authenticated users" ON endpoint_status_history
  FOR SELECT USING (auth.role() = 'authenticated');

-- Current status: Public read (for admin dashboard)
CREATE POLICY "Current status is viewable by authenticated users" ON endpoint_status_current
  FOR SELECT USING (auth.role() = 'authenticated');
