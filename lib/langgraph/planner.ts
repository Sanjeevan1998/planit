import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger, extractJSON } from "@/lib/logger";
import type { PlanitStateType } from "./state";
import type { Itinerary, ItineraryNode, BookingLink } from "@/types";

// ============================================================
// PlanitPlanner — Single Gemini call with Google Search grounding
//
// Replaces the 3-step (scout → detailer → brancher) chain with
// one call to Gemini 2.5 Flash that searches Google natively.
// Result: ~3-5s instead of 22s, real-time event data, no Tavily.
// ============================================================

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
}

const TODAY = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

// Return the next occurrence of a weekday (0=Sun…6=Sat), or today if it matches.
function nextWeekday(targetDay: number): Date {
  const now = new Date();
  const diff = (targetDay - now.getDay() + 7) % 7;
  const d = new Date(now);
  d.setDate(now.getDate() + (diff === 0 ? 0 : diff));
  return d;
}

// Format a Date as YYYY-MM-DD
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Detect how many days the user is planning and what start date to use.
// Returns { numDays, startDate } where startDate is YYYY-MM-DD.
function detectPlanDuration(request: string): { numDays: number; startDate: string; tzOffset: string } {
  const text = request.toLowerCase();

  // Detect number of days: "3 day", "3-day", "three day"
  const dayMatch = text.match(/(\d+)\s*[-\s]?day/);
  const wordDays: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, week: 7, weekend: 2 };
  let numDays = dayMatch ? parseInt(dayMatch[1]) : 1;
  for (const [word, n] of Object.entries(wordDays)) {
    if (text.includes(word + " day") || text.includes(word + "-day") || (word === "weekend" && text.includes("weekend"))) {
      numDays = n;
      break;
    }
  }
  numDays = Math.min(Math.max(numDays, 1), 7); // clamp 1–7

  // Detect start date from day-of-week mentions
  let startDate = toDateStr(new Date()); // default: today
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < weekdays.length; i++) {
    if (text.includes(weekdays[i])) {
      startDate = toDateStr(nextWeekday(i));
      break;
    }
  }
  if (text.includes("tomorrow")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    startDate = toDateStr(tomorrow);
  }
  if (text.includes("this weekend") || text.includes("weekend")) {
    startDate = toDateStr(nextWeekday(6)); // Saturday
    if (numDays === 1) numDays = 2;
  }
  if (text.includes("next week")) {
    const nextMon = new Date();
    nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7 || 7));
    startDate = toDateStr(nextMon);
    if (numDays === 1) numDays = 5;
  }

  // Detect timezone from destination keywords (expand as needed)
  const tzOffset = text.includes("tokyo") || text.includes("japan") ? "+09:00"
    : text.includes("london") || text.includes("uk") ? "+01:00"
    : text.includes("new york") || text.includes("nyc") ? "-04:00"
    : text.includes("paris") || text.includes("france") ? "+02:00"
    : text.includes("los angeles") || text.includes("la ") ? "-07:00"
    : text.includes("sydney") || text.includes("australia") ? "+10:00"
    : text.includes("dubai") ? "+04:00"
    : text.includes("singapore") || text.includes("bangkok") ? "+08:00"
    : "+09:00"; // default to JST

  return { numDays, startDate, tzOffset };
}

// Build example date sequence for the prompt
function buildDateSchedule(startDate: string, numDays: number, tzOffset: string): string {
  const lines: string[] = [];
  for (let d = 0; d < numDays; d++) {
    const [y, m, day] = startDate.split("-").map(Number);
    const date = new Date(y, m - 1, day + d);
    const dateStr = toDateStr(date);
    const label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    lines.push(`Day ${d + 1} (${label}): use date ${dateStr} for all nodes on this day`);
  }
  return lines.join("\n");
}

// ── Intent detection (keyword-based, no LLM call needed) ────
export function detectIntent(input: string): PlanitStateType["intent"] {
  const text = input.toLowerCase();

  if (/plan|itinerary|schedule|what.*do|show.*saturday|show.*sunday|show.*day|\d+\s*[-\s]?day|make.*day|weekend trip|week.*trip/.test(text))
    return "plan_day";
  if (/how.*get|commute|transit|train|bus|uber|route|directions/.test(text))
    return "get_commute";
  if (/nearby|close|around here|walking distance|find.*near/.test(text))
    return "find_nearby";
  if (/change|pivot|instead|rain|weather|cancel|alternative/.test(text))
    return "pivot_itinerary";
  if (/remember|note|i (like|hate|prefer|don't|dislike|love)/.test(text))
    return "update_memory";
  if (/book|reserve|ticket|buy/.test(text))
    return "book_activity";
  if (/hello|hi|hey|who are you|what can you/.test(text))
    return "onboard";

  return "general_chat";
}

// ── Build accessibility + preference context string ──────────
function buildUserContext(state: PlanitStateType): string {
  const prefs = state.accessibility_prefs;
  const memories = state.user_memories.slice(0, 20);

  const lines: string[] = [];

  if (state.user_profile?.name) lines.push(`User: ${state.user_profile.name}`);
  if (state.itinerary?.destination || state.user_input)
    lines.push(`Destination: ${state.itinerary?.destination ?? ""}`);

  if (prefs) {
    const access = [
      prefs.uses_cane && "uses a cane",
      prefs.uses_wheelchair && "uses a wheelchair",
      prefs.requires_elevator && "MUST have elevator access at every transit stop",
      prefs.low_sensory && "prefers quiet, low-stimulation environments",
      prefs.light_sensitivity && "sensitive to bright/flashing lights",
      ...(prefs.allergies || []).map((a) => `SEVERE ALLERGY: ${a.item} — exclude all venues serving this`),
      ...(prefs.dietary_restrictions || []).map((d) => `Dietary: ${d.label}`),
    ].filter(Boolean);
    if (access.length) lines.push(`Accessibility & health: ${access.join("; ")}`);
  }

  if (memories.length) {
    lines.push(
      `Known preferences: ${memories.map((m) => `${m.key}=${m.value}`).join(", ")}`
    );
  }

  return lines.join("\n");
}

// ── Main planner: one Gemini call with Google Search grounding ─
export async function planWithGemini(
  state: PlanitStateType
): Promise<{
  itinerary: Partial<Itinerary>;
  response: string;
}> {
  const genAI = getGenAI();
  const userContext = buildUserContext(state);
  const request = state.user_input || state.voice_transcript || "Plan a great day";
  const today = TODAY();

  logger.info("Planner", `Planning: "${request}"`);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} }] as never[], // native Google Search grounding (type suppressed — runtime supported)
  });

  const { numDays, startDate, tzOffset } = detectPlanDuration(request);
  const dateSchedule = buildDateSchedule(startDate, numDays, tzOffset);
  const dayWord = numDays === 1 ? "day" : `${numDays}-day`;

  const prompt = `You are Planit, an AI travel planner. Today is ${today}.

${userContext}

User request: "${request}"

This is a ${dayWord} itinerary. Plan dates:
${dateSchedule}

Timezone offset for all times: ${tzOffset}

Search Google for real current events, attractions, and venues matching this request.
Then create a detailed itinerary as a JSON object.

RULES:
- For EACH day: generate 4–6 main activities (nodes with branch_label "A", parent_id null)
- For each main activity, add 1–2 alternative branches (branch_label "B" or "C", parent_id = the main activity's id)
- Every node MUST have real booking_links (Booking.com, Google Maps, Uber, Viator, etc.)
- Every node MUST have a why_selected field explaining why it fits the user
- Respect ALL accessibility needs and allergies — this is critical
- Include real addresses and accurate lat/lng coordinates for each location
- Times MUST be realistic (activities start between 08:00 and 22:00 local time)
- Spread activities across the day: morning (09:00–12:00), afternoon (12:00–17:00), evening (17:00–21:00)
- Each activity must not overlap with the next (add travel time between them)
- Include at least one meal node (type: "meal") per day
- For multi-day itineraries: use DIFFERENT dates per day as listed above; spread theme across days (e.g. Day 1 = culture, Day 2 = food/markets, Day 3 = nature/parks)
- Alternative nodes (branch_label "B"/"C") must use the SAME date and time slot as their parent

Return ONLY valid JSON, no markdown fences, no other text:
{
  "title": "Itinerary title",
  "destination": "City name",
  "budget_tier": "mid-range",
  "nodes": [
    {
      "id": "day1_node1",
      "parent_id": null,
      "branch_label": "A",
      "type": "activity",
      "title": "Place name",
      "description": "2–3 sentence description",
      "location": { "lat": 35.6762, "lng": 139.6503, "address": "Full address" },
      "start_time": "${startDate}T09:00:00${tzOffset}",
      "end_time": "${startDate}T11:00:00${tzOffset}",
      "duration_minutes": 120,
      "budget_tier": "mid-range",
      "budget_estimate": "¥1,000",
      "why_selected": "Why this matches the user",
      "tags": ["outdoor", "quiet"],
      "accessibility_verified": true,
      "accessibility_notes": "Step-free entrance, elevator on left",
      "booking_links": [
        { "platform": "Google Maps", "url": "https://maps.google.com/?q=Place+Name", "label": "View on Google Maps", "category": "activity" }
      ],
      "is_active": true,
      "is_pivot": false
    },
    {
      "id": "day1_node1_b",
      "parent_id": "day1_node1",
      "branch_label": "B",
      "type": "activity",
      "title": "Alternative place",
      "description": "...",
      "location": { "lat": 35.6800, "lng": 139.7000, "address": "..." },
      "start_time": "${startDate}T09:00:00${tzOffset}",
      "end_time": "${startDate}T11:00:00${tzOffset}",
      "duration_minutes": 120,
      "budget_tier": "premium",
      "budget_estimate": "¥5,000",
      "why_selected": "Splurge alternative",
      "tags": ["premium"],
      "accessibility_verified": true,
      "accessibility_notes": "",
      "booking_links": [
        { "platform": "Viator", "url": "https://www.viator.com/searchResults/all?text=destination", "label": "Book on Viator", "category": "activity" }
      ],
      "is_active": false,
      "is_pivot": false
    }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    logger.debug("Planner", `Raw response (first 400 chars): ${text.slice(0, 400)}`);

    const parsed = extractJSON(text);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      logger.warn("Planner", "JSON parse failed, raw content:", text.slice(0, 300));
      return { itinerary: {}, response: "" };
    }

    const data = parsed as Record<string, unknown>;
    const nodes = (data.nodes as ItineraryNode[]) || [];
    logger.success("Planner", `Parsed itinerary — ${nodes.length} nodes`);

    const mainNodes = nodes.filter((n) => !n.parent_id);
    // Count unique days
    const uniqueDays = new Set(mainNodes.map((n) => n.start_time?.split("T")[0]).filter(Boolean)).size;
    const dayLabel = uniqueDays > 1 ? `${uniqueDays}-day itinerary` : "day";

    return {
      itinerary: data as Partial<Itinerary>,
      response:
        nodes.length > 0
          ? `I've planned your ${dayLabel}! ${mainNodes.length} activities across ${uniqueDays > 1 ? `${uniqueDays} days` : "the day"} with alternatives for each. Check the timeline on the right.`
          : "",
    };
  } catch (err) {
    logger.error("Planner", "Gemini planning failed", (err as Error).message);
    return { itinerary: {}, response: "" };
  }
}

// ── Pivot planner: re-plan around a context change ──────────
export async function pivotWithGemini(
  state: PlanitStateType
): Promise<{ voice_message: string; new_nodes: ItineraryNode[] }> {
  const genAI = getGenAI();

  const trigger = state.pivot_trigger || "user_request";
  const weather = state.weather;
  const city = state.current_location?.city || state.itinerary?.destination || "the city";
  const userName = state.user_profile?.name || "there";

  const triggerDesc = {
    weather: `it just started ${weather?.condition || "raining"} (${weather?.temperature_celsius}°C)`,
    location_deviation: "the user has gone off-route",
    user_request: "the user wants to change plans",
    time_overrun: "the user is running behind schedule",
  }[trigger];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} }] as never[],
  });

  const prompt = `You are Planit. ${triggerDesc} in ${city}.

User preferences: ${buildUserContext(state)}
Current plan: ${JSON.stringify(state.itinerary?.nodes?.slice(0, 3), null, 2)}

Search for 2–3 nearby alternatives that work given the situation.
Return JSON:
{
  "voice_message": "Hey ${userName}, [warm 2-sentence update explaining the change and new plan]",
  "new_nodes": [/* 2-3 ItineraryNode objects with booking_links */]
}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = extractJSON(result.response.text()) as {
      voice_message?: string;
      new_nodes?: ItineraryNode[];
    } | null;

    return {
      voice_message: parsed?.voice_message || `Hey ${userName}, I've found some alternatives for you.`,
      new_nodes: parsed?.new_nodes || [],
    };
  } catch (err) {
    logger.error("Planner", "Pivot failed", (err as Error).message);
    return { voice_message: `Hey ${userName}, let me find some alternatives.`, new_nodes: [] };
  }
}

// ── General chat with optional search grounding ─────────────
export async function chatWithGemini(
  state: PlanitStateType,
  useSearch = false
): Promise<{ response: string; memory_updates: Array<{ category: string; key: string; value: string }> }> {
  const genAI = getGenAI();
  const input = state.user_input || state.voice_transcript || "";
  const userName = state.user_profile?.name;

  const tools = (useSearch ? [{ googleSearch: {} }] : []) as never[];
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools });

  const history = state.messages
    .slice(-6)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "User" : "Planit"}: ${m.content}`)
    .join("\n");

  const isOnboarding = !userName || state.intent === "onboard";

  const systemCtx = isOnboarding
    ? `You are Planit, a warm AI travel sidekick. Learn about the user through conversation.
Extract: name, destination, accessibility needs, budget, travel vibe.
After learning key info respond with JSON:
{ "response": "...", "memory_updates": [{ "category": "...", "key": "...", "value": "..." }] }`
    : `You are Planit, the user's AI travel sidekick.
User: ${userName || "Traveler"}
Context: ${buildUserContext(state)}
${history ? `Recent conversation:\n${history}` : ""}
Be helpful, warm, and concise. Reference their preferences naturally.`;

  const prompt = isOnboarding
    ? `${systemCtx}\n\nUser: "${input}"`
    : `${systemCtx}\n\nUser: "${input}"\n\nIf the user gives feedback about a place (e.g. "too dark", "too loud"), also return JSON: { "response": "...", "memory_updates": [...] }. Otherwise just reply naturally.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const parsed = extractJSON(text) as { response?: string; memory_updates?: Array<{ category: string; key: string; value: string }> } | null;
    if (parsed?.response) {
      return {
        response: parsed.response,
        memory_updates: parsed.memory_updates || [],
      };
    }
    return { response: text, memory_updates: [] };
  } catch (err) {
    logger.error("Planner", "Chat failed", (err as Error).message);
    return { response: "Something went wrong, try again!", memory_updates: [] };
  }
}
