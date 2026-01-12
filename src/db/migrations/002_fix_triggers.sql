-- Fix migration: Drop and recreate triggers to handle existing installations
-- Run this if you got errors about triggers already existing

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_athletes_updated_at ON athletes;

-- Recreate the trigger
CREATE TRIGGER update_athletes_updated_at BEFORE UPDATE ON athletes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
