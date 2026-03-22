# Planit — The AI Travel Sidekick That Learns You

> Plan smarter trips through conversation. Planit remembers your preferences, builds branching itineraries with real alternatives, and re-routes on the fly when weather or plans change.

**Live Demo:** https://ernesto-rubied-callie.ngrok-free.dev/dashboard

**Voice Mode:** Available on the `feature/voice-control` branch. Full hands-free planning via Gemini Live — no text needed. Not yet deployed (pending end-to-end testing), but implemented.

---

## What is Planit?

Planit is a conversational AI travel planner built for the **"The Sidekick"** hackathon track. You describe a trip in plain language, and Planit builds a multi-day, multi-city itinerary tailored to your vibe, budget, and accessibility needs — with real alternatives at every step, not a single rigid plan.

It learns your preferences across sessions (semantic memory), adapts in real-time to weather and location changes, and supports users with mobility, sensory, dietary, and other accessibility needs out of the box.

---

## What Makes It Different

Most AI travel planners output a linear list. Planit does five things that don't exist elsewhere together:

### 1. Branching Timeline
Every activity comes with 2–3 alternatives (A/B/C) rendered as a decision tree. You explore options instead of accepting whatever the AI decided. Built as a `parent_id` tree structure — selecting one branch radio-deselects the others in the same slot.

### 2. Persistent Semantic Memory
Planit remembers you across sessions using pgvector. Every message is silently analyzed to extract preferences (likes, dislikes, vibe, budget, transport style) which are stored as 1536-dim embeddings and retrieved via cosine similarity in future sessions. Confidence-scored, source-tracked (voice/text/inferred), and fully editable via the Memory Panel.

### 3. Accessibility-First Planning
The AI prompt is dynamically constructed from your accessibility profile — wheelchair access, elevator requirements, low-sensory venues, allergy severity (mild to fatal), dietary restrictions, and more. These aren't UI filters applied after planning; they're injected as hard constraints into the Gemini prompt before any activity is suggested.

### 4. Real-Time GPS + Weather Pivot
`navigator.geolocation.watchPosition()` runs continuously while you're on your trip. If you deviate from your itinerary, it calls `/api/location` to check if a re-route is needed. Separately, OpenWeatherMap data is fetched before planning and can trigger indoor alternatives when rain is detected.

### 5. Gemini Live Voice with Barge-In
The voice interface (VoiceOrb) opens a real WebSocket to `wss://generativelanguage.googleapis.com` and streams microphone audio in 250ms chunks — including while the model is responding. This enables true barge-in: you can interrupt mid-answer. Not speech-to-text bolted onto a text chat; a real bidirectional audio session.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Framer Motion, Tailwind CSS 4 |
| AI / LLM | Gemini 2.5 Flash, Gemini Live WebSocket, LangGraph (StateGraph) |
| Embeddings | Gemini `gemini-embedding-001` (1536 dims) |
| Database | Supabase PostgreSQL + pgvector extension |
| APIs | Google Maps (Places, Directions, Geocoding), OpenWeatherMap, Tavily |
| Auth | Supabase Auth with Row-Level Security |

---

## Architecture

User messages hit `/api/chat`, which loads user profile + accessibility prefs + up to 50 memories, then passes them into a **LangGraph StateGraph**. A keyword-based router directs to one of four nodes: `planner` (Gemini 2.5 Flash with Google Search grounding), `pivot` (re-schedule around weather/location), `commute` (Google Routes + Uber deep links), or `chat` (free-form conversation). The planner returns a structured branching itinerary (parent-child nodes) persisted to Supabase. Memory extraction runs fire-and-forget on every planning message, vectorizing new preferences for future sessions.

---

## Local Setup

```bash
git clone <repo>
cd planit
npm install
cp .env.LOCAL .env.local
```

Fill in `.env.local` with your keys:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as above |
| `GOOGLE_GENERATIVE_AI_API_KEY` | https://aistudio.google.com/app/apikey |
| `GOOGLE_MAPS_API_KEY` + `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials (enable Maps, Places, Directions, Geocoding APIs) |
| `OPENWEATHER_API_KEY` | https://openweathermap.org/api |
| `TAVILY_API_KEY` | https://app.tavily.com |
| `FIRECRAWL_API_KEY` | https://firecrawl.dev (optional — used for deep menu scraping) |

```bash
npm run dev
# Open http://localhost:3000
```

---

## Hackathon Track: The Sidekick

| Criterion | How Planit addresses it |
|---|---|
| Adaptation & Personalization (35%) | pgvector semantic memory across sessions; vibe detection from natural language; preferences injected into every AI call |
| Interaction Design (25%) | Branching timeline replaces linear lists; multi-step guided flow; direct booking links on every activity |
| Contextual Awareness (25%) | Real-time GPS pivot; weather-triggered re-routing; 50 memories + accessibility prefs in every LLM context window |
| Ethics & Accessibility (15%) | Comprehensive disability support (mobility/vision/hearing/sensory/dietary); RLS row-level security; transparent memory panel with source attribution and deletion |
