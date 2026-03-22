-- ============================================================
-- PLANIT — Supabase Schema Migration 001
-- Enables pgvector extension for semantic memory search
-- ============================================================

-- Enable pgvector for embedding storage and similarity search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USER PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  persona       TEXT,                        -- e.g. "adventurous solo traveler"
  memory_vector vector(1536),                -- Embedding of aggregated user traits
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACCESSIBILITY PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS accessibility_preferences (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- Mobility
  uses_wheelchair                 BOOLEAN DEFAULT FALSE,
  uses_cane                       BOOLEAN DEFAULT FALSE,
  requires_elevator               BOOLEAN DEFAULT FALSE,
  requires_ramp                   BOOLEAN DEFAULT FALSE,
  limited_walking_distance_meters INTEGER,
  -- Vision
  low_vision                      BOOLEAN DEFAULT FALSE,
  blind                           BOOLEAN DEFAULT FALSE,
  -- Hearing
  hard_of_hearing                 BOOLEAN DEFAULT FALSE,
  deaf                            BOOLEAN DEFAULT FALSE,
  -- Sensory
  low_sensory                     BOOLEAN DEFAULT FALSE,
  light_sensitivity               BOOLEAN DEFAULT FALSE,
  -- Dietary (JSONB for flexibility)
  dietary_restrictions            JSONB DEFAULT '[]'::jsonb,
  allergies                       JSONB DEFAULT '[]'::jsonb,
  -- Transport & Environment
  preferred_transport             TEXT[] DEFAULT '{}',
  avoided_environments            TEXT[] DEFAULT '{}',
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- USER MEMORY UNITS
-- Each memory is a discrete "fact" about the user, vectorized
-- for semantic retrieval in future planning sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS user_memories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN (
                'likes', 'dislikes', 'allergies', 'accessibility',
                'budget', 'vibe', 'transport', 'accommodation',
                'activity', 'custom'
              )),
  key         TEXT NOT NULL,                 -- e.g. "prefers_quiet_spaces"
  value       TEXT NOT NULL,                 -- e.g. "true" or "strongly prefers quiet cafes over chains"
  embedding   vector(1536),                  -- Vectorized key+value for semantic retrieval
  source      TEXT DEFAULT 'text' CHECK (source IN ('voice', 'text', 'inferred', 'feedback')),
  confidence  FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast vector similarity search on memories
CREATE INDEX IF NOT EXISTS user_memories_embedding_idx
  ON user_memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS user_memories_user_id_idx ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS user_memories_category_idx ON user_memories(user_id, category);

-- ============================================================
-- ITINERARIES
-- Stores the branching day plans as JSONB
-- ============================================================
CREATE TABLE IF NOT EXISTS itineraries (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  destination            TEXT NOT NULL,
  start_date             DATE NOT NULL,
  end_date               DATE NOT NULL,
  budget_tier            TEXT DEFAULT 'mid-range' CHECK (budget_tier IN ('budget', 'mid-range', 'premium', 'luxury')),
  budget_total_estimate  TEXT,
  status                 TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'pivoted')),
  accessibility_summary  TEXT,
  pivot_reason           TEXT,
  weather_context        JSONB,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS itineraries_user_id_idx ON itineraries(user_id);
CREATE INDEX IF NOT EXISTS itineraries_status_idx ON itineraries(user_id, status);

-- ============================================================
-- ITINERARY NODES
-- Each node is one activity/meal/transport/etc. in a day plan.
-- Supports branching: a node with parent_id IS NULL is a root.
-- Multiple children of the same parent are alternative branches.
-- ============================================================
CREATE TABLE IF NOT EXISTS itinerary_nodes (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id            UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  parent_id               UUID REFERENCES itinerary_nodes(id) ON DELETE SET NULL,
  branch_label            TEXT,              -- "A", "B", "Primary", "Foodie Path"
  type                    TEXT NOT NULL CHECK (type IN (
                            'activity', 'meal', 'transport', 'accommodation',
                            'event', 'rest', 'pivot'
                          )),
  title                   TEXT NOT NULL,
  description             TEXT,
  -- Location
  lat                     FLOAT,
  lng                     FLOAT,
  address                 TEXT,
  place_id                TEXT,              -- Google Places ID
  -- Time
  start_time              TIMESTAMPTZ,
  end_time                TIMESTAMPTZ,
  duration_minutes        INTEGER,
  -- Budget
  budget_tier             TEXT DEFAULT 'mid-range',
  budget_estimate         TEXT,
  -- Accessibility
  accessibility_verified  BOOLEAN DEFAULT FALSE,
  accessibility_notes     TEXT,
  -- Rich metadata
  why_selected            TEXT,              -- "Selected because Low-Sensory zone"
  tags                    TEXT[] DEFAULT '{}',
  phone                   TEXT,
  website                 TEXT,
  opening_hours           TEXT,
  rating                  FLOAT,
  review_count            INTEGER,
  image_url               TEXT,
  atmosphere              TEXT[] DEFAULT '{}',
  booking_links           JSONB DEFAULT '[]'::jsonb,
  transport_options       JSONB DEFAULT '[]'::jsonb,
  is_active               BOOLEAN DEFAULT FALSE,
  is_pivot                BOOLEAN DEFAULT FALSE,
  metadata                JSONB DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS itinerary_nodes_itinerary_id_idx ON itinerary_nodes(itinerary_id);
CREATE INDEX IF NOT EXISTS itinerary_nodes_parent_id_idx ON itinerary_nodes(parent_id);
CREATE INDEX IF NOT EXISTS itinerary_nodes_active_idx ON itinerary_nodes(itinerary_id, is_active);

-- ============================================================
-- INTERACTIONS / FEEDBACK LOOP
-- Every accept, reject, pivot, or verbal feedback is logged.
-- The Memory Agent reads these to update the User Memory Unit.
-- ============================================================
CREATE TABLE IF NOT EXISTS interactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  itinerary_id      UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  node_id           UUID REFERENCES itinerary_nodes(id) ON DELETE SET NULL,
  type              TEXT NOT NULL CHECK (type IN (
                      'accept', 'reject', 'pivot', 'feedback', 'voice_command'
                    )),
  content           TEXT,                    -- Raw user feedback text
  extracted_memory  JSONB,                   -- Parsed memory update from the feedback
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interactions_user_id_idx ON interactions(user_id);
CREATE INDEX IF NOT EXISTS interactions_itinerary_id_idx ON interactions(itinerary_id);

-- ============================================================
-- RLS (Row Level Security) POLICIES
-- Each user can only access their own data
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessibility_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- accessibility_preferences
CREATE POLICY "Users can manage own accessibility prefs"
  ON accessibility_preferences FOR ALL USING (auth.uid() = user_id);

-- user_memories
CREATE POLICY "Users can manage own memories"
  ON user_memories FOR ALL USING (auth.uid() = user_id);

-- itineraries
CREATE POLICY "Users can manage own itineraries"
  ON itineraries FOR ALL USING (auth.uid() = user_id);

-- itinerary_nodes
CREATE POLICY "Users can manage own itinerary nodes"
  ON itinerary_nodes FOR ALL
  USING (
    itinerary_id IN (
      SELECT id FROM itineraries WHERE user_id = auth.uid()
    )
  );

-- interactions
CREATE POLICY "Users can manage own interactions"
  ON interactions FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Semantic memory search: find memories similar to a query embedding
CREATE OR REPLACE FUNCTION search_user_memories(
  p_user_id   UUID,
  p_embedding vector(1536),
  p_limit     INT DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE (
  id         UUID,
  category   TEXT,
  key        TEXT,
  value      TEXT,
  confidence FLOAT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.category,
    m.key,
    m.value,
    m.confidence,
    1 - (m.embedding <=> p_embedding) AS similarity
  FROM user_memories m
  WHERE
    m.user_id = p_user_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> p_embedding) >= p_threshold
  ORDER BY m.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_accessibility_preferences_updated_at
  BEFORE UPDATE ON accessibility_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_memories_updated_at
  BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_itineraries_updated_at
  BEFORE UPDATE ON itineraries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
