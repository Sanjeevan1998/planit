-- Add timezone column to itineraries for correct local-time display
-- Uses IANA timezone string (e.g. "Asia/Tokyo", "America/New_York")
ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
