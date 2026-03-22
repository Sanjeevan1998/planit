-- ============================================================
-- PLANIT — Demo Seed (for local/hackathon use without auth)
-- Inserts a placeholder user so the demo UUID resolves FK constraints
-- ============================================================

INSERT INTO user_profiles (id, email, name, persona)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'demo@planit.app',
  'Demo User',
  'curious traveler'
)
ON CONFLICT (id) DO NOTHING;
