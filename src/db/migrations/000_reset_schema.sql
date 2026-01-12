-- RESET SCHEMA - Use with caution! This will drop all tables and data.
-- Only run this if you want to start fresh during development.

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS athlete_follows CASCADE;
DROP TABLE IF EXISTS race_results CASCADE;
DROP TABLE IF EXISTS scrape_jobs CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS athletes CASCADE;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Now you can run 001_initial_schema.sql again
