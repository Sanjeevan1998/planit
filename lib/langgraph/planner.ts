import { GoogleGenerativeAI } from "@google/generative-ai";
import { find as geoFind } from "geo-tz";
import { logger, extractJSON } from "@/lib/logger";
import type { PlanitStateType } from "./state";
import type { Itinerary, ItineraryNode, BookingLink } from "@/types";
import type { TripSuggestions, ActivitySuggestion, ActivityConflict, FoodSuggestion } from "@/types";

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

// ── Comprehensive destination → timezone map ─────────────────
// Used by both detectPlanDuration (for UTC offset) and build routes (for IANA zone).
const DEST_TIMEZONE_MAP: Array<[string, { offset: string; iana: string }]> = [
  // East Asia
  ["tokyo",          { offset: "+09:00", iana: "Asia/Tokyo" }],
  ["japan",          { offset: "+09:00", iana: "Asia/Tokyo" }],
  ["osaka",          { offset: "+09:00", iana: "Asia/Tokyo" }],
  ["kyoto",          { offset: "+09:00", iana: "Asia/Tokyo" }],
  ["hiroshima",      { offset: "+09:00", iana: "Asia/Tokyo" }],
  ["sapporo",        { offset: "+09:00", iana: "Asia/Tokyo" }],
  ["seoul",          { offset: "+09:00", iana: "Asia/Seoul" }],
  ["korea",          { offset: "+09:00", iana: "Asia/Seoul" }],
  ["beijing",        { offset: "+08:00", iana: "Asia/Shanghai" }],
  ["shanghai",       { offset: "+08:00", iana: "Asia/Shanghai" }],
  ["china",          { offset: "+08:00", iana: "Asia/Shanghai" }],
  ["hong kong",      { offset: "+08:00", iana: "Asia/Hong_Kong" }],
  ["taipei",         { offset: "+08:00", iana: "Asia/Taipei" }],
  ["taiwan",         { offset: "+08:00", iana: "Asia/Taipei" }],
  ["singapore",      { offset: "+08:00", iana: "Asia/Singapore" }],
  ["kuala lumpur",   { offset: "+08:00", iana: "Asia/Kuala_Lumpur" }],
  ["malaysia",       { offset: "+08:00", iana: "Asia/Kuala_Lumpur" }],
  ["manila",         { offset: "+08:00", iana: "Asia/Manila" }],
  ["philippines",    { offset: "+08:00", iana: "Asia/Manila" }],
  // Southeast Asia
  ["bali",           { offset: "+08:00", iana: "Asia/Makassar" }],
  ["indonesia",      { offset: "+07:00", iana: "Asia/Jakarta" }],
  ["jakarta",        { offset: "+07:00", iana: "Asia/Jakarta" }],
  ["bangkok",        { offset: "+07:00", iana: "Asia/Bangkok" }],
  ["thailand",       { offset: "+07:00", iana: "Asia/Bangkok" }],
  ["chiang mai",     { offset: "+07:00", iana: "Asia/Bangkok" }],
  ["ho chi minh",    { offset: "+07:00", iana: "Asia/Ho_Chi_Minh" }],
  ["hanoi",          { offset: "+07:00", iana: "Asia/Ho_Chi_Minh" }],
  ["vietnam",        { offset: "+07:00", iana: "Asia/Ho_Chi_Minh" }],
  ["yangon",         { offset: "+06:30", iana: "Asia/Rangoon" }],
  ["myanmar",        { offset: "+06:30", iana: "Asia/Rangoon" }],
  ["dhaka",          { offset: "+06:00", iana: "Asia/Dhaka" }],
  ["bangladesh",     { offset: "+06:00", iana: "Asia/Dhaka" }],
  // South Asia
  ["mumbai",         { offset: "+05:30", iana: "Asia/Kolkata" }],
  ["delhi",          { offset: "+05:30", iana: "Asia/Kolkata" }],
  ["india",          { offset: "+05:30", iana: "Asia/Kolkata" }],
  ["bangalore",      { offset: "+05:30", iana: "Asia/Kolkata" }],
  ["kolkata",        { offset: "+05:30", iana: "Asia/Kolkata" }],
  ["colombo",        { offset: "+05:30", iana: "Asia/Colombo" }],
  ["sri lanka",      { offset: "+05:30", iana: "Asia/Colombo" }],
  ["kathmandu",      { offset: "+05:45", iana: "Asia/Kathmandu" }],
  ["nepal",          { offset: "+05:45", iana: "Asia/Kathmandu" }],
  ["karachi",        { offset: "+05:00", iana: "Asia/Karachi" }],
  ["pakistan",       { offset: "+05:00", iana: "Asia/Karachi" }],
  // Middle East
  ["dubai",          { offset: "+04:00", iana: "Asia/Dubai" }],
  ["uae",            { offset: "+04:00", iana: "Asia/Dubai" }],
  ["abu dhabi",      { offset: "+04:00", iana: "Asia/Dubai" }],
  ["riyadh",         { offset: "+03:00", iana: "Asia/Riyadh" }],
  ["saudi arabia",   { offset: "+03:00", iana: "Asia/Riyadh" }],
  ["tel aviv",       { offset: "+03:00", iana: "Asia/Jerusalem" }],
  ["israel",         { offset: "+03:00", iana: "Asia/Jerusalem" }],
  ["tehran",         { offset: "+03:30", iana: "Asia/Tehran" }],
  ["iran",           { offset: "+03:30", iana: "Asia/Tehran" }],
  ["istanbul",       { offset: "+03:00", iana: "Europe/Istanbul" }],
  ["turkey",         { offset: "+03:00", iana: "Europe/Istanbul" }],
  // Europe
  ["london",         { offset: "+01:00", iana: "Europe/London" }],
  ["uk",             { offset: "+01:00", iana: "Europe/London" }],
  ["england",        { offset: "+01:00", iana: "Europe/London" }],
  ["scotland",       { offset: "+01:00", iana: "Europe/London" }],
  ["paris",          { offset: "+02:00", iana: "Europe/Paris" }],
  ["france",         { offset: "+02:00", iana: "Europe/Paris" }],
  ["berlin",         { offset: "+02:00", iana: "Europe/Berlin" }],
  ["germany",        { offset: "+02:00", iana: "Europe/Berlin" }],
  ["munich",         { offset: "+02:00", iana: "Europe/Berlin" }],
  ["rome",           { offset: "+02:00", iana: "Europe/Rome" }],
  ["italy",          { offset: "+02:00", iana: "Europe/Rome" }],
  ["milan",          { offset: "+02:00", iana: "Europe/Rome" }],
  ["florence",       { offset: "+02:00", iana: "Europe/Rome" }],
  ["venice",         { offset: "+02:00", iana: "Europe/Rome" }],
  ["madrid",         { offset: "+02:00", iana: "Europe/Madrid" }],
  ["spain",          { offset: "+02:00", iana: "Europe/Madrid" }],
  ["barcelona",      { offset: "+02:00", iana: "Europe/Madrid" }],
  ["amsterdam",      { offset: "+02:00", iana: "Europe/Amsterdam" }],
  ["netherlands",    { offset: "+02:00", iana: "Europe/Amsterdam" }],
  ["prague",         { offset: "+02:00", iana: "Europe/Prague" }],
  ["czech",          { offset: "+02:00", iana: "Europe/Prague" }],
  ["vienna",         { offset: "+02:00", iana: "Europe/Vienna" }],
  ["austria",        { offset: "+02:00", iana: "Europe/Vienna" }],
  ["zurich",         { offset: "+02:00", iana: "Europe/Zurich" }],
  ["switzerland",    { offset: "+02:00", iana: "Europe/Zurich" }],
  ["lisbon",         { offset: "+01:00", iana: "Europe/Lisbon" }],
  ["portugal",       { offset: "+01:00", iana: "Europe/Lisbon" }],
  ["athens",         { offset: "+03:00", iana: "Europe/Athens" }],
  ["greece",         { offset: "+03:00", iana: "Europe/Athens" }],
  ["stockholm",      { offset: "+02:00", iana: "Europe/Stockholm" }],
  ["sweden",         { offset: "+02:00", iana: "Europe/Stockholm" }],
  ["oslo",           { offset: "+02:00", iana: "Europe/Oslo" }],
  ["norway",         { offset: "+02:00", iana: "Europe/Oslo" }],
  ["copenhagen",     { offset: "+02:00", iana: "Europe/Copenhagen" }],
  ["denmark",        { offset: "+02:00", iana: "Europe/Copenhagen" }],
  ["helsinki",       { offset: "+03:00", iana: "Europe/Helsinki" }],
  ["finland",        { offset: "+03:00", iana: "Europe/Helsinki" }],
  ["warsaw",         { offset: "+02:00", iana: "Europe/Warsaw" }],
  ["poland",         { offset: "+02:00", iana: "Europe/Warsaw" }],
  ["budapest",       { offset: "+02:00", iana: "Europe/Budapest" }],
  ["hungary",        { offset: "+02:00", iana: "Europe/Budapest" }],
  ["bucharest",      { offset: "+03:00", iana: "Europe/Bucharest" }],
  ["romania",        { offset: "+03:00", iana: "Europe/Bucharest" }],
  ["moscow",         { offset: "+03:00", iana: "Europe/Moscow" }],
  ["russia",         { offset: "+03:00", iana: "Europe/Moscow" }],
  ["kyiv",           { offset: "+03:00", iana: "Europe/Kiev" }],
  ["ukraine",        { offset: "+03:00", iana: "Europe/Kiev" }],
  ["brussels",       { offset: "+02:00", iana: "Europe/Brussels" }],
  ["belgium",        { offset: "+02:00", iana: "Europe/Brussels" }],
  ["dublin",         { offset: "+01:00", iana: "Europe/Dublin" }],
  ["ireland",        { offset: "+01:00", iana: "Europe/Dublin" }],
  ["edinburgh",      { offset: "+01:00", iana: "Europe/London" }],
  // Africa
  ["cairo",          { offset: "+02:00", iana: "Africa/Cairo" }],
  ["egypt",          { offset: "+02:00", iana: "Africa/Cairo" }],
  ["johannesburg",   { offset: "+02:00", iana: "Africa/Johannesburg" }],
  ["south africa",   { offset: "+02:00", iana: "Africa/Johannesburg" }],
  ["nairobi",        { offset: "+03:00", iana: "Africa/Nairobi" }],
  ["kenya",          { offset: "+03:00", iana: "Africa/Nairobi" }],
  ["marrakech",      { offset: "+01:00", iana: "Africa/Casablanca" }],
  ["morocco",        { offset: "+01:00", iana: "Africa/Casablanca" }],
  ["lagos",          { offset: "+01:00", iana: "Africa/Lagos" }],
  ["nigeria",        { offset: "+01:00", iana: "Africa/Lagos" }],
  // Americas
  ["new york",       { offset: "-04:00", iana: "America/New_York" }],
  ["nyc",            { offset: "-04:00", iana: "America/New_York" }],
  ["boston",         { offset: "-04:00", iana: "America/New_York" }],
  ["miami",          { offset: "-04:00", iana: "America/New_York" }],
  ["washington",     { offset: "-04:00", iana: "America/New_York" }],
  ["toronto",        { offset: "-04:00", iana: "America/Toronto" }],
  ["canada",         { offset: "-04:00", iana: "America/Toronto" }],
  ["montreal",       { offset: "-04:00", iana: "America/Toronto" }],
  ["chicago",        { offset: "-05:00", iana: "America/Chicago" }],
  ["dallas",         { offset: "-05:00", iana: "America/Chicago" }],
  ["houston",        { offset: "-05:00", iana: "America/Chicago" }],
  ["denver",         { offset: "-06:00", iana: "America/Denver" }],
  ["los angeles",    { offset: "-07:00", iana: "America/Los_Angeles" }],
  ["la ",            { offset: "-07:00", iana: "America/Los_Angeles" }],
  ["san francisco",  { offset: "-07:00", iana: "America/Los_Angeles" }],
  ["seattle",        { offset: "-07:00", iana: "America/Los_Angeles" }],
  ["portland",       { offset: "-07:00", iana: "America/Los_Angeles" }],
  ["las vegas",      { offset: "-07:00", iana: "America/Los_Angeles" }],
  ["vancouver",      { offset: "-07:00", iana: "America/Vancouver" }],
  ["mexico city",    { offset: "-05:00", iana: "America/Mexico_City" }],
  ["mexico",         { offset: "-05:00", iana: "America/Mexico_City" }],
  ["cancun",         { offset: "-05:00", iana: "America/Cancun" }],
  ["buenos aires",   { offset: "-03:00", iana: "America/Argentina/Buenos_Aires" }],
  ["argentina",      { offset: "-03:00", iana: "America/Argentina/Buenos_Aires" }],
  ["sao paulo",      { offset: "-03:00", iana: "America/Sao_Paulo" }],
  ["brazil",         { offset: "-03:00", iana: "America/Sao_Paulo" }],
  ["rio de janeiro", { offset: "-03:00", iana: "America/Sao_Paulo" }],
  ["lima",           { offset: "-05:00", iana: "America/Lima" }],
  ["peru",           { offset: "-05:00", iana: "America/Lima" }],
  ["bogota",         { offset: "-05:00", iana: "America/Bogota" }],
  ["colombia",       { offset: "-05:00", iana: "America/Bogota" }],
  ["santiago",       { offset: "-03:00", iana: "America/Santiago" }],
  ["chile",          { offset: "-03:00", iana: "America/Santiago" }],
  ["havana",         { offset: "-04:00", iana: "America/Havana" }],
  ["cuba",           { offset: "-04:00", iana: "America/Havana" }],
  // Oceania
  ["sydney",         { offset: "+10:00", iana: "Australia/Sydney" }],
  ["melbourne",      { offset: "+10:00", iana: "Australia/Sydney" }],
  ["australia",      { offset: "+10:00", iana: "Australia/Sydney" }],
  ["brisbane",       { offset: "+10:00", iana: "Australia/Brisbane" }],
  ["perth",          { offset: "+08:00", iana: "Australia/Perth" }],
  ["auckland",       { offset: "+12:00", iana: "Pacific/Auckland" }],
  ["new zealand",    { offset: "+12:00", iana: "Pacific/Auckland" }],
  ["honolulu",       { offset: "-10:00", iana: "Pacific/Honolulu" }],
  ["hawaii",         { offset: "-10:00", iana: "Pacific/Honolulu" }],
];

// Look up destination timezone from any text (request string or destination name).
// Returns { offset: "+09:00", iana: "Asia/Tokyo" }.
// Defaults to UTC if no destination is recognised — avoids the JST-default bug.
export function getDestTimezone(text: string): { offset: string; iana: string } {
  const lower = text.toLowerCase();
  for (const [key, tz] of DEST_TIMEZONE_MAP) {
    if (lower.includes(key)) return tz;
  }
  return { offset: "+00:00", iana: "UTC" };
}

// Convert an IANA timezone name to a fixed UTC offset string ("±HH:MM").
// Uses the Intl API — no extra packages needed.
export function ianaToOffset(ianaTimezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
    // raw is like "GMT+9", "GMT-5", "GMT+5:30"
    const match = raw.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) return "+00:00";
    const sign = match[1];
    const h = String(parseInt(match[2])).padStart(2, "0");
    const m = String(match[3] ? parseInt(match[3]) : 0).padStart(2, "0");
    return `${sign}${h}:${m}`;
  } catch {
    return "+00:00";
  }
}

// Determine IANA timezone from GPS coordinates (via geo-tz).
// Falls back to text-based lookup if coords are zero/missing.
export function tzFromCoords(lat: number, lng: number, fallbackText = ""): { offset: string; iana: string } {
  if (lat !== 0 || lng !== 0) {
    try {
      const zones = geoFind(lat, lng);
      if (zones.length > 0) {
        const iana = zones[0];
        return { iana, offset: ianaToOffset(iana) };
      }
    } catch {
      // fall through to text lookup
    }
  }
  return getDestTimezone(fallbackText);
}

// Detect how many days the user is planning and what start date to use.
// Returns { numDays, startDate } where startDate is YYYY-MM-DD.
export function detectPlanDuration(request: string): { numDays: number; startDate: string; tzOffset: string } {
  const text = request.toLowerCase();

  // Detect number of days: "3 day", "3-day", "3 days"
  // Explicit digit always wins; word-map is only a fallback when no digit was found.
  const dayMatch = text.match(/(\d+)\s*[-\s]?days?/);
  let numDays = 1;
  if (dayMatch) {
    numDays = parseInt(dayMatch[1]);
  } else {
    // Fallback: written-out words ("three days", "weekend", etc.)
    const wordDays: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, week: 7, weekend: 2 };
    for (const [word, n] of Object.entries(wordDays)) {
      if (text.includes(word + " day") || text.includes(word + "-day") || (word === "weekend" && text.includes("weekend"))) {
        numDays = n;
        break;
      }
    }
  }
  numDays = Math.min(Math.max(numDays, 1), 21); // clamp 1–21

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

  const { offset: tzOffset } = getDestTimezone(text);
  return { numDays, startDate, tzOffset };
}

// Return ticket-booking platforms appropriate for the destination timezone / region
function getTicketPlatforms(tzOffset: string): string {
  if (["+09:00", "+08:00"].includes(tzOffset)) {
    // East Asia
    return "Klook (klook.com), KKday (kkday.com), PIA Ticket Japan (pia.jp), Lawson Ticket (l-tike.com), e+ (eplus.jp), Ticketmaster Japan, venue official site";
  }
  if (["+00:00", "+01:00", "+02:00"].includes(tzOffset)) {
    // Europe / UK
    return "Ticketmaster (ticketmaster.co.uk / .eu), See Tickets (seetickets.com), Eventbrite (eventbrite.co.uk), Dice.fm, Skiddle (skiddle.com), venue official site";
  }
  if (["-04:00", "-05:00", "-06:00", "-07:00", "-08:00"].includes(tzOffset)) {
    // Americas
    return "Ticketmaster (ticketmaster.com), StubHub (stubhub.com), SeatGeek (seatgeek.com), Live Nation (livenation.com), Eventbrite (eventbrite.com), venue official site";
  }
  if (["+10:00", "+11:00"].includes(tzOffset)) {
    // Australia / Pacific
    return "Ticketek (ticketek.com.au), Moshtix (moshtix.com.au), Humanitix (humanitix.com), Eventbrite AU, venue official site";
  }
  // Global fallback
  return "Eventbrite (eventbrite.com), Klook (klook.com), GetYourGuide (getyourguide.com), Ticketmaster, Viagogo (viagogo.com), venue official site";
}

export function buildUserContextFromRaw(opts: {
  name?: string;
  wheelchair?: boolean;
  elevator?: boolean;
  lowSensory?: boolean;
  allergies?: Array<{ item: string }>;
  memories?: Array<{ key: string; value: string }>;
}): string {
  const lines: string[] = [];
  if (opts.name) lines.push(`User: ${opts.name}`);
  const access = [
    opts.wheelchair && "uses a wheelchair",
    opts.elevator && "MUST have elevator access at every transit stop",
    opts.lowSensory && "prefers quiet, low-stimulation environments",
    ...(opts.allergies || []).map((a) => `SEVERE ALLERGY: ${a.item}`),
  ].filter(Boolean) as string[];
  if (access.length) lines.push(`Accessibility: ${access.join("; ")}`);
  if (opts.memories?.length)
    lines.push(`Preferences: ${opts.memories.slice(0, 15).map((m) => `${m.key}=${m.value}`).join(", ")}`);
  return lines.join("\n");
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
  const ticketPlatforms = getTicketPlatforms(tzOffset);

  const prompt = `You are Planit, an AI travel planner. Today is ${today}.

${userContext}

User request: "${request}"

This is a ${dayWord} itinerary. Plan EXACTLY ${numDays} day(s) — no more, no fewer.
Dates:
${dateSchedule}

Timezone offset for all times: ${tzOffset}

STEP 1 — SEARCH FOR REAL EVENTS:
Use Google Search to find concerts, live music, festivals, art exhibitions, theatre shows, sports matches,
pop-up markets, seasonal events, or special experiences happening in the destination on EACH of the visit dates above.
Search queries to use:
  - "[destination] concerts [date range]"
  - "[destination] events [month year]"
  - "[destination] festivals [dates]"
  - "[destination] exhibitions [dates]"
For each day, identify the BEST 1–2 real events that overlap with the evening slot (19:00–22:00).
If a found event is truly unmissable (e.g. a famous festival day), it can replace the regular evening activity.

STEP 2 — BUILD THE ITINERARY:
Create a detailed itinerary as a JSON object using the structure below.

MANDATORY DAILY STRUCTURE — every single day must follow this schedule:
  07:30–08:30  Breakfast (type: "meal") — local café, hotel breakfast, or convenience store
  09:00–11:30  Morning activity or experience
  11:30–13:00  Lunch (type: "meal") — local restaurant matching user taste
  13:30–16:00  Afternoon activity or experience
  16:00–16:30  Optional snack / dessert stop (type: "meal" or "rest")
  17:00–18:30  Late afternoon activity or leisure
  18:30–20:00  Dinner (type: "meal") — highlight restaurant for the destination
  20:00–22:00  Evening: REAL EVENT if found (type: "event") OR regular evening activity (type: "activity")

RULES:
- Generate EXACTLY ${numDays} day(s) — do NOT add an extra day
- For EACH day: 4–5 main activity/experience nodes PLUS 3 meal nodes (breakfast, lunch, dinner)
- PRIORITISE real events found in Step 1 for the evening slot — use type: "event" for these
- For each main node, add 1–2 alternative branches (branch_label "B" or "C", parent_id = the main node's id)
- Every node MUST have real booking_links (see platforms below)
- Event nodes (type: "event") MUST include a "Buy Tickets" booking_link using the right platform
  Ticket platforms for this destination: ${ticketPlatforms}
- Every node MUST have a why_selected field explaining why it fits the user
- Respect ALL accessibility needs and allergies — this is critical for safety
- Include real addresses and accurate lat/lng coordinates for each location
- No two nodes on the same day may overlap in time — leave 20–30 min travel buffer between them
- For multi-day itineraries: use DIFFERENT dates per day as listed above; vary the theme per day
- Alternative nodes (branch_label "B"/"C") MUST use the SAME date and time slot as their parent
- Meal alternatives (e.g. a cheaper vs. premium restaurant for the same lunch slot) are encouraged

Return ONLY valid JSON, no markdown fences, no other text:
{
  "title": "Itinerary title",
  "destination": "City name",
  "budget_tier": "mid-range",
  "nodes": [
    {
      "id": "day1_breakfast",
      "parent_id": null,
      "branch_label": "A",
      "type": "meal",
      "title": "Breakfast at [Café Name]",
      "description": "2–3 sentence description",
      "location": { "lat": 35.6762, "lng": 139.6503, "address": "Full address" },
      "start_time": "${startDate}T07:30:00${tzOffset}",
      "end_time": "${startDate}T08:30:00${tzOffset}",
      "duration_minutes": 60,
      "budget_tier": "budget",
      "budget_estimate": "¥800",
      "why_selected": "Why this matches the user",
      "tags": ["breakfast", "cafe"],
      "accessibility_verified": true,
      "accessibility_notes": "",
      "booking_links": [
        { "platform": "Google Maps", "url": "https://maps.google.com/?q=Cafe+Name+Tokyo", "label": "View on Google Maps", "category": "restaurant" }
      ],
      "is_active": true,
      "is_pivot": false
    },
    {
      "id": "day1_morning_activity",
      "parent_id": null,
      "branch_label": "A",
      "type": "activity",
      "title": "Place name",
      "description": "2–3 sentence description",
      "location": { "lat": 35.6800, "lng": 139.7000, "address": "Full address" },
      "start_time": "${startDate}T09:00:00${tzOffset}",
      "end_time": "${startDate}T11:30:00${tzOffset}",
      "duration_minutes": 150,
      "budget_tier": "mid-range",
      "budget_estimate": "¥1,500",
      "why_selected": "Why this matches the user",
      "tags": ["morning", "culture"],
      "accessibility_verified": true,
      "accessibility_notes": "Step-free entrance, elevator on left",
      "booking_links": [
        { "platform": "Google Maps", "url": "https://maps.google.com/?q=Place+Name", "label": "View on Google Maps", "category": "activity" },
        { "platform": "Klook", "url": "https://www.klook.com/search/?query=Place+Name", "label": "Book on Klook", "category": "activity" }
      ],
      "is_active": true,
      "is_pivot": false
    },
    {
      "id": "day1_evening_event",
      "parent_id": null,
      "branch_label": "A",
      "type": "event",
      "title": "REAL EVENT NAME (e.g. 'Coldplay World Tour — Tokyo Dome')",
      "description": "Real event description — date, venue, what to expect",
      "location": { "lat": 35.7050, "lng": 139.7513, "address": "Tokyo Dome, 1-3-61 Koraku, Bunkyo-ku, Tokyo" },
      "start_time": "${startDate}T20:00:00${tzOffset}",
      "end_time": "${startDate}T22:30:00${tzOffset}",
      "duration_minutes": 150,
      "budget_tier": "premium",
      "budget_estimate": "¥8,000–15,000",
      "why_selected": "Live concert happening on this exact date — a unique experience you can only catch now",
      "tags": ["concert", "live-music", "evening", "ticketed"],
      "accessibility_verified": true,
      "accessibility_notes": "Wheelchair accessible seating available — request when booking",
      "booking_links": [
        { "platform": "Ticketmaster", "url": "https://www.ticketmaster.co.jp/", "label": "Buy Tickets on Ticketmaster", "category": "event" },
        { "platform": "e+", "url": "https://eplus.jp/", "label": "Buy Tickets on e+", "category": "event" },
        { "platform": "Google Maps", "url": "https://maps.google.com/?q=Tokyo+Dome", "label": "Venue on Google Maps", "category": "activity" }
      ],
      "is_active": true,
      "is_pivot": false
    },
    {
      "id": "day1_morning_activity_b",
      "parent_id": "day1_morning_activity",
      "branch_label": "B",
      "type": "activity",
      "title": "Alternative place",
      "description": "...",
      "location": { "lat": 35.6600, "lng": 139.6900, "address": "..." },
      "start_time": "${startDate}T09:00:00${tzOffset}",
      "end_time": "${startDate}T11:30:00${tzOffset}",
      "duration_minutes": 150,
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

// ── Finalize: schedule selected activities + insert transport nodes ─
//
// Approach: ask Gemini only for (a) a schedule (id → times) and (b) new transport nodes.
// We merge the updated times back into the original nodes server-side.
// This avoids asking Gemini to echo large JSON blobs, preventing truncation.
export async function finalizeWithGemini(
  selectedNodes: ItineraryNode[],
  destination: string,
  userContext: string
): Promise<{ nodes: ItineraryNode[] }> {
  const genAI = getGenAI();
  // No Google Search needed here — we're just scheduling and routing
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const { tzOffset } = detectPlanDuration(destination);

  // Derive unique days from existing node times, or default to today
  const existingDates = [...new Set(
    selectedNodes.map((n) => n.start_time?.split("T")[0]).filter(Boolean)
  )].sort();
  const startDate = existingDates[0] ?? toDateStr(new Date());
  const numDays = existingDates.length || 1;
  const dateSchedule = buildDateSchedule(startDate, numDays, tzOffset);

  // Separate meals from activities so Gemini knows how to slot them
  const activityList = selectedNodes
    .map((n, i) =>
      `${i + 1}. id="${n.id}" | type=${n.type} | "${n.title}" | ${n.location?.address ?? "unknown"} | ${n.duration_minutes ?? 60}min`
    )
    .join("\n");

  const prompt = `You are Planit, scheduling a finalized ${numDays === 1 ? "1-day" : `${numDays}-day`} trip to ${destination}.
${userContext ? `\n${userContext}\n` : ""}
Activities to schedule (keep ids EXACTLY as given — do NOT change them):
${activityList}

Date schedule:
${dateSchedule}
Timezone: ${tzOffset}

SCHEDULING RULES:
1. Assign start_time and end_time to every activity id above
2. Respect these daily slots: breakfast 07:30, lunch 12:00, dinner 18:30 (type=meal nodes)
   Non-meal activities fill morning (09:00–12:00), afternoon (13:00–17:30), evening (20:00–22:00)
3. Leave a 20–30 min travel gap between activities — don't schedule back-to-back
4. Group geographically close activities on the same day to minimise travel
5. Distribute evenly across ${numDays} day(s) — do NOT cram everything into one day
6. After inserting gaps, create ONE transport node between each consecutive pair on the SAME day

Return ONLY valid JSON, no markdown fences:
{
  "schedule": [
    { "id": "exact-id-from-list", "start_time": "${startDate}T09:00:00${tzOffset}", "end_time": "${startDate}T11:00:00${tzOffset}" }
  ],
  "transport_nodes": [
    {
      "id": "transport_1_to_2",
      "parent_id": null,
      "branch_label": "A",
      "type": "transport",
      "title": "Getting to [Next Activity]",
      "description": "Transport options from previous stop",
      "start_time": "${startDate}T11:00:00${tzOffset}",
      "end_time": "${startDate}T11:20:00${tzOffset}",
      "duration_minutes": 20,
      "budget_tier": "budget",
      "budget_estimate": "¥200",
      "why_selected": "Connects activities",
      "tags": [],
      "accessibility_verified": true,
      "accessibility_notes": "",
      "booking_links": [],
      "is_active": true,
      "is_pivot": false,
      "location": { "lat": 0, "lng": 0, "address": "" },
      "transport_options": [
        {
          "mode": "walk",
          "label": "Walk (describe route)",
          "duration_minutes": 20,
          "cost_estimate": "Free",
          "tags": ["cheapest"],
          "booking_link": { "platform": "Google Maps", "url": "https://maps.google.com/", "label": "Get directions", "category": "transport" }
        },
        {
          "mode": "train",
          "label": "Train via [line name]",
          "duration_minutes": 12,
          "cost_estimate": "¥200",
          "tags": ["fastest"],
          "booking_link": { "platform": "Google Maps", "url": "https://maps.google.com/", "label": "Get directions", "category": "transport" }
        }
      ]
    }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    logger.debug("Planner", `Finalize raw (first 300): ${raw.slice(0, 300)}`);

    const parsed = extractJSON(raw) as {
      schedule?: Array<{ id: string; start_time: string; end_time: string }>;
      transport_nodes?: ItineraryNode[];
    } | null;

    if (!parsed?.schedule?.length) {
      logger.warn("Planner", "Finalize returned no schedule — returning original nodes without transport");
      // Graceful fallback: return selected nodes as-is so user isn't left with nothing
      return { nodes: selectedNodes };
    }

    // Build id → updated times map
    const timeMap = new Map(
      parsed.schedule.map((s) => [s.id, { start_time: s.start_time, end_time: s.end_time }])
    );

    // Apply updated times to original nodes (all other fields preserved)
    const scheduledNodes = selectedNodes.map((n) => {
      const times = timeMap.get(n.id);
      return times ? { ...n, start_time: times.start_time, end_time: times.end_time } : n;
    });

    const transportNodes = parsed.transport_nodes ?? [];
    const allNodes = [...scheduledNodes, ...transportNodes];

    logger.success("Planner", `Finalized — ${scheduledNodes.length} activities + ${transportNodes.length} transport nodes`);
    return { nodes: allNodes };
  } catch (err) {
    logger.error("Planner", "Finalize failed", (err as Error).message);
    return { nodes: selectedNodes }; // fallback: return nodes without transport rather than error
  }
}

// ── Suggest: search for activities + events per city, no scheduling ─
export async function suggestActivities(
  request: string,
  userContext: string
): Promise<{ suggestions: TripSuggestions | null; response: string }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} }] as never[],
  });

  const { numDays, startDate, tzOffset } = detectPlanDuration(request);
  const ticketPlatforms = getTicketPlatforms(tzOffset);
  const today = TODAY();
  // Suggest number of cities: 1 per 2–3 days, capped at 5 for very long trips
  const multiCityHint = numDays <= 2 ? "1 city"
    : numDays <= 4 ? "1–2 cities"
    : numDays <= 7 ? "2–3 cities"
    : numDays <= 12 ? "3–4 cities"
    : "4–5 cities";

  // Calculate end date
  const start = new Date(startDate);
  const endDate = toDateStr(new Date(start.getTime() + (numDays - 1) * 86400000));

  // Extract strong vibe signals from the user's request
  const requestLower = request.toLowerCase();
  const vibeHints: string[] = [];
  if (/party|club|nightlife|rave|techno|edm|bar hop|pub crawl|drinks|drinking/.test(requestLower))
    vibeHints.push("⚠️ NIGHTLIFE-FIRST TRIP: User explicitly wants to party. Each city MUST include 3–5 nightlife activities (clubs, ruin bars, techno venues, bar streets, pub crawls). Evening slots should default to nightlife, not sightseeing. Prioritise cities/areas famous for nightlife.");
  if (/food|eat|restaurant|cuisine|foodie|culinary/.test(requestLower))
    vibeHints.push("FOOD-FOCUSED: Emphasise food tours, local markets, restaurant districts, and culinary experiences.");
  if (/adventure|hike|outdoor|nature|trek|sport/.test(requestLower))
    vibeHints.push("ADVENTURE-FOCUSED: Prioritise outdoor activities, hiking, sports, and active experiences.");
  if (/art|museum|culture|history|heritage/.test(requestLower))
    vibeHints.push("CULTURE-FOCUSED: Weight towards museums, galleries, historical sites, and cultural events.");
  if (/relax|chill|slow|spa|wellness|peaceful/.test(requestLower))
    vibeHints.push("RELAXATION-FOCUSED: Include spa days, slow mornings, parks, and low-intensity activities.");
  const vibeBlock = vibeHints.length > 0 ? `\nVIBE CONSTRAINTS (apply to ALL cities):\n${vibeHints.join("\n")}\n` : "";

  const prompt = `You are Planit, an AI travel planner. Today is ${today}.
${userContext ? `\n${userContext}\n` : ""}${vibeBlock}
User request: "${request}"

This is a ${numDays}-day trip starting ${startDate} (ending ${endDate}).
Suggested number of cities to visit: ${multiCityHint}.

TASK — Do NOT schedule anything. Your job is to SUGGEST activities grouped by city.

STEP 1 — ALLOCATE CITIES:
Based on the destination and ${numDays} days, decide which cities to visit and how many days each.
For Japan 14 days example: Tokyo 5d, Kyoto 3d, Osaka 3d, Hiroshima 2d, Nara 1d.
Assign date ranges to each city starting from ${startDate}.

STEP 2 — SEARCH FOR REAL EVENTS:
For each city and its date range, use Google Search to find concerts, festivals, exhibitions,
sports matches, or special experiences happening on those exact dates.
Search: "[city] events [month year]", "[city] concerts [dates]", "[city] festivals [dates]"
Include up to 5 real events per city with exact dates and times.

STEP 3 — FIND GENERAL ACTIVITIES:
For each city find 10–15 must-do activities (NOT tourist traps, mix of iconic + hidden gems).
Categories: cultural, outdoor, shopping, nightlife, wellness, experience, hidden_gem.
Include real addresses, accurate lat/lng, accessibility info, and booking links.

Return ONLY valid JSON, no markdown fences:
{
  "trip_title": "14 Days in Japan",
  "destination": "Japan",
  "start_date": "${startDate}",
  "end_date": "${endDate}",
  "cities": [
    {
      "city": "Tokyo",
      "date_range": { "from": "${startDate}", "to": "YYYY-MM-DD" },
      "activities": [
        {
          "id": "tokyo_act_1",
          "city": "Tokyo",
          "type": "activity",
          "title": "Tsukiji Outer Market",
          "description": "2–3 sentences",
          "location": { "lat": 35.6654, "lng": 139.7707, "address": "Tsukiji, Chuo-ku, Tokyo" },
          "duration_minutes": 120,
          "budget_tier": "budget",
          "budget_estimate": "¥2,000",
          "tags": ["food", "market", "morning"],
          "why_selected": "Reason matched to user preferences",
          "accessibility_verified": true,
          "accessibility_notes": "Mostly flat",
          "booking_links": [
            { "platform": "Google Maps", "url": "https://maps.google.com/?q=Tsukiji+Market", "label": "View on Google Maps", "category": "activity" }
          ],
          "is_event": false
        }
      ],
      "events": [
        {
          "id": "tokyo_evt_1",
          "city": "Tokyo",
          "type": "event",
          "title": "REAL EVENT NAME — do not fabricate",
          "description": "Real description with venue",
          "location": { "lat": 35.7050, "lng": 139.7513, "address": "Full venue address" },
          "duration_minutes": 150,
          "budget_tier": "premium",
          "budget_estimate": "¥8,000–15,000",
          "tags": ["concert", "evening", "ticketed"],
          "why_selected": "Happening exactly during your visit",
          "accessibility_verified": true,
          "accessibility_notes": "Wheelchair accessible seating available on request",
          "booking_links": [
            { "platform": "e+", "url": "https://eplus.jp/", "label": "Buy Tickets on e+", "category": "event" }
          ],
          "is_event": true,
          "event_date": "YYYY-MM-DD",
          "event_start": "HH:MM",
          "event_end": "HH:MM"
        }
      ]
    }
  ]
}

Ticket platforms for this destination: ${ticketPlatforms}
Respect ALL accessibility constraints — this is critical for safety.
ONLY include real, verified events — never fabricate event names or dates.`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    logger.debug("Planner", `suggestActivities raw (first 400): ${raw.slice(0, 400)}`);
    const parsed = extractJSON(raw) as TripSuggestions | null;

    if (!parsed?.cities?.length) {
      logger.warn("Planner", "suggestActivities returned no cities");
      return { suggestions: null, response: "I couldn't find activities for that destination. Try rephrasing your request." };
    }

    const totalActs = parsed.cities.reduce((s, c) => s + c.activities.length + c.events.length, 0);
    logger.success("Planner", `suggestActivities — ${totalActs} suggestions across ${parsed.cities.length} cities`);
    return {
      suggestions: parsed,
      response: `I found ${totalActs} activities and events across ${parsed.cities.length} ${parsed.cities.length === 1 ? "city" : "cities"} for your ${numDays}-day trip. Pick what excites you and I'll build your perfect itinerary!`,
    };
  } catch (err) {
    logger.error("Planner", "suggestActivities failed", (err as Error).message);
    return { suggestions: null, response: "Something went wrong while searching for activities. Please try again." };
  }
}

// ── Build: schedule selected activities + fill whole day ─────
//
// Approach: ask Gemini ONLY for a compact schedule (no Search grounding,
// no full node blobs). We reconstruct full ItineraryNode objects server-side
// from the ActivitySuggestion data we already have. This keeps the prompt
// small, eliminates 2-minute Search delays, and avoids empty/truncated responses.
export async function buildFromSelections(
  selectedIds: string[],
  suggestions: TripSuggestions,
  userContext: string
): Promise<{ nodes: ItineraryNode[]; conflicts: ActivityConflict[]; timezone: string }> {
  const genAI = getGenAI();
  // No Google Search — we schedule existing data, don't need to discover new places
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Flatten all activities from suggestions
  const allActivities: ActivitySuggestion[] = suggestions.cities.flatMap((c) => [
    ...c.activities,
    ...c.events,
  ]);
  const selected = allActivities.filter((a) => selectedIds.includes(a.id));

  if (selected.length === 0) return { nodes: [], conflicts: [], timezone: "UTC" };

  // ── Detect event conflicts ──────────────────────────────────
  function toMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  const fixedEvents = selected.filter((a) => a.is_event && a.event_date && a.event_start);
  const byDate = new Map<string, ActivitySuggestion[]>();
  for (const ev of fixedEvents) {
    const arr = byDate.get(ev.event_date!) ?? [];
    arr.push(ev);
    byDate.set(ev.event_date!, arr);
  }
  const conflicts: ActivityConflict[] = [];
  for (const [date, dayEvents] of byDate.entries()) {
    if (dayEvents.length < 2) continue;
    for (let i = 0; i < dayEvents.length; i++) {
      for (let j = i + 1; j < dayEvents.length; j++) {
        const a = dayEvents[i], b = dayEvents[j];
        const aS = toMinutes(a.event_start!), aE = aS + (a.duration_minutes ?? 120);
        const bS = toMinutes(b.event_start!), bE = bS + (b.duration_minutes ?? 120);
        if (aS < bE && bS < aE) {
          const existing = conflicts.find(
            (c) => c.date === date && c.options.some((o) => o.id === a.id || o.id === b.id)
          );
          if (existing) {
            if (!existing.options.find((o) => o.id === a.id)) existing.options.push(a);
            if (!existing.options.find((o) => o.id === b.id)) existing.options.push(b);
          } else {
            conflicts.push({
              date,
              time_slot: `${a.event_start}–${b.event_end ?? b.event_start}`,
              options: [a, b],
            });
          }
        }
      }
    }
  }
  if (conflicts.length > 0) return { nodes: [], conflicts, timezone: "UTC" };

  // ── Compact scheduling prompt (no Search, small output) ─────
  // Use geo-tz with the first selected activity's coordinates for accurate timezone detection.
  const firstCoords = selected[0]?.location ?? { lat: 0, lng: 0 };
  const { offset: tzOffset, iana: detectedIANA } = tzFromCoords(
    firstCoords.lat, firstCoords.lng, suggestions.destination
  );
  const numDays = Math.ceil(
    (new Date(suggestions.end_date).getTime() - new Date(suggestions.start_date).getTime()) / 86400000
  ) + 1;
  const dateSchedule = buildDateSchedule(suggestions.start_date, numDays, tzOffset);

  // Build a city → allowed dates set for hard enforcement
  const cityDateMap = new Map<string, { from: string; to: string }>();
  for (const c of suggestions.cities) {
    cityDateMap.set(c.city, c.date_range);
  }

  // Enumerate every allowed date per city so Gemini has zero ambiguity
  const cityDateRanges = suggestions.cities.map((c) => {
    const dates: string[] = [];
    const cur = new Date(c.date_range.from + "T00:00:00");
    const end = new Date(c.date_range.to + "T00:00:00");
    while (cur <= end) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
    return `  ${c.city} → ONLY on: ${dates.join(", ")}`;
  }).join("\n");

  const activityList = selected
    .map((a, i) => {
      const city = a.city;
      const range = cityDateMap.get(city);
      const allowedDates = range
        ? (() => {
            const dates: string[] = [];
            const cur = new Date(range.from + "T00:00:00");
            const end = new Date(range.to + "T00:00:00");
            while (cur <= end) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
            return dates.join(", ");
          })()
        : "any";
      const fixedTime =
        a.is_event && a.event_date
          ? ` FIXED:${a.event_date}T${a.event_start}`
          : ` dur:${a.duration_minutes}min`;
      return `${i + 1}. id="${a.id}" city=${city} allowedDates=[${allowedDates}] "${a.title}"${fixedTime}`;
    })
    .join("\n");

  const prompt = `You are a travel scheduler. Build a ${numDays}-day itinerary for ${suggestions.destination}.
${userContext ? `\n${userContext}\n` : ""}
Activities to schedule (IDs are exact — do NOT change them):
${activityList}

Day dates (use these exact dates):
${dateSchedule}

STRICT city-to-date rules — VIOLATION = INVALID OUTPUT:
${cityDateRanges}
Each activity above lists its "allowedDates". You MUST pick a date from that list. Any activity scheduled outside its allowedDates is an error.

Timezone: ${tzOffset}

Rules:
- FIXED events must keep their exact date and start time
- NEVER schedule an activity outside its city's allowed dates — this is the #1 rule
- Distribute activities evenly across the available days for each city (aim for 3–5 per day)
- Start times no earlier than 09:00, use 2-digit hours (e.g. "09:00" not "9:00")
- Between consecutive activities on the same day, add a short transport entry
- If gap between activities is >50min, add one filler (nearby walk/viewpoint/market)
- Do NOT add meals
- Keep total output small — compact JSON only

Return ONLY valid JSON, no markdown:
{
  "schedule": [
    { "id": "exact_activity_id", "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM" }
  ],
  "fillers": [
    {
      "id": "filler_1_1",
      "title": "Short walk through Ueno Park",
      "date": "YYYY-MM-DD",
      "start": "HH:MM",
      "end": "HH:MM",
      "duration_minutes": 40,
      "description": "One sentence.",
      "lat": 35.715,
      "lng": 139.773,
      "address": "Ueno Park, Tokyo",
      "budget_tier": "budget",
      "budget_estimate": "Free",
      "tags": ["walk", "park"]
    }
  ],
  "transport": [
    {
      "id": "t_1_1",
      "date": "YYYY-MM-DD",
      "start": "HH:MM",
      "end": "HH:MM",
      "from_title": "Place A",
      "to_title": "Place B",
      "walk_mins": 15,
      "walk_cost": "Free",
      "transit_mins": 8,
      "transit_label": "Hibiya Line (2 stops)",
      "transit_cost": "¥180"
    }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    logger.debug("Planner", `buildFromSelections raw (first 600): ${raw.slice(0, 600)}`);
    const parsed = extractJSON(raw) as {
      schedule?: Array<{ id: string; date: string; start: string; end: string }>;
      fillers?: Array<{
        id: string; title: string; date: string; start: string; end: string;
        duration_minutes: number; description: string; lat: number; lng: number;
        address: string; budget_tier: string; budget_estimate: string; tags: string[];
      }>;
      transport?: Array<{
        id: string; date: string; start: string; end: string;
        from_title: string; to_title: string;
        walk_mins: number; walk_cost: string;
        transit_mins?: number; transit_label?: string; transit_cost?: string;
      }>;
    } | null;

    if (!parsed?.schedule?.length) {
      logger.warn("Planner", "buildFromSelections returned no schedule — building fallback from selected activities");
      // Fallback: just use selected activities with placeholder times so the flow doesn't break
      return { nodes: buildFallbackNodes(selected, suggestions, tzOffset), conflicts: [], timezone: detectedIANA };
    }

    const createdAt = new Date().toISOString();

    // ── Reconstruct activity nodes from compact schedule ──────
    const actMap = new Map(selected.map((a) => [a.id, a]));
    const schedMap = new Map(parsed.schedule.map((s) => [s.id, s]));

    const activityNodes: ItineraryNode[] = [];
    for (const sched of parsed.schedule) {
      const src = actMap.get(sched.id);
      if (!src) continue;
      activityNodes.push({
        id: sched.id,
        itinerary_id: "",
        parent_id: undefined,
        branch_label: "A",
        type: src.type === "event" ? "event" : "activity",
        title: src.title,
        description: src.description,
        location: src.location,
        start_time: `${sched.date}T${sched.start}:00${tzOffset}`,
        end_time: `${sched.date}T${sched.end}:00${tzOffset}`,
        duration_minutes: src.duration_minutes,
        budget_tier: src.budget_tier as ItineraryNode["budget_tier"],
        budget_estimate: src.budget_estimate,
        why_selected: src.why_selected,
        tags: src.tags,
        accessibility_verified: src.accessibility_verified,
        accessibility_notes: src.accessibility_notes ?? "",
        booking_links: src.booking_links ?? [],
        transport_options: [],
        is_active: true,
        is_pivot: false,
        created_at: createdAt,
      } as ItineraryNode);
    }
    void schedMap; // used above

    // ── Reconstruct filler nodes ──────────────────────────────
    const fillerNodes: ItineraryNode[] = (parsed.fillers ?? []).map((f) => ({
      id: f.id,
      itinerary_id: "",
      parent_id: undefined,
      branch_label: "A",
      type: "activity",
      title: f.title,
      description: f.description,
      location: { lat: f.lat, lng: f.lng, address: f.address },
      start_time: `${f.date}T${f.start}:00${tzOffset}`,
      end_time: `${f.date}T${f.end}:00${tzOffset}`,
      duration_minutes: f.duration_minutes,
      budget_tier: (f.budget_tier ?? "budget") as ItineraryNode["budget_tier"],
      budget_estimate: f.budget_estimate ?? "Free",
      why_selected: "Gap filler",
      tags: f.tags ?? [],
      accessibility_verified: true,
      accessibility_notes: "",
      booking_links: [
        {
          platform: "Google Maps",
          url: `https://maps.google.com/?q=${encodeURIComponent(f.title)}`,
          label: "View on Google Maps",
          category: "activity",
        },
      ],
      transport_options: [],
      is_active: true,
      is_pivot: false,
      created_at: createdAt,
    } as ItineraryNode));

    // ── Reconstruct transport nodes ───────────────────────────
    const transportNodes: ItineraryNode[] = (parsed.transport ?? []).map((t) => {
      const transportOpts = [];
      if (t.walk_mins) {
        transportOpts.push({
          mode: "walk",
          label: `Walk (~${t.walk_mins} min)`,
          duration_minutes: t.walk_mins,
          cost_estimate: t.walk_cost ?? "Free",
          tags: [] as string[],
          steps: [],
          booking_link: {
            platform: "Google Maps",
            url: `https://maps.google.com/dir/${encodeURIComponent(t.from_title)}/${encodeURIComponent(t.to_title)}`,
            label: "Get walking directions",
            category: "transport",
          },
        });
      }
      if (t.transit_mins && t.transit_label) {
        transportOpts.push({
          mode: "transit",
          label: `${t.transit_label} (~${t.transit_mins} min)`,
          duration_minutes: t.transit_mins,
          cost_estimate: t.transit_cost ?? "Unknown",
          tags: [] as string[],
          steps: [],
          booking_link: {
            platform: "Google Maps",
            url: `https://maps.google.com/dir/${encodeURIComponent(t.from_title)}/${encodeURIComponent(t.to_title)}`,
            label: "Get transit directions",
            category: "transport",
          },
        });
      }
      return {
        id: t.id,
        itinerary_id: "",
        parent_id: undefined,
        branch_label: "A",
        type: "transport",
        title: `${t.from_title} → ${t.to_title}`,
        description: `Transport from ${t.from_title} to ${t.to_title}`,
        location: { lat: 0, lng: 0, address: "" },
        start_time: `${t.date}T${t.start}:00${tzOffset}`,
        end_time: `${t.date}T${t.end}:00${tzOffset}`,
        duration_minutes: Math.min(t.walk_mins ?? 999, t.transit_mins ?? 999),
        budget_tier: "budget",
        budget_estimate: t.walk_cost ?? "Free",
        why_selected: "Connecting transport",
        tags: ["transport"],
        accessibility_verified: true,
        accessibility_notes: "",
        booking_links: [],
        transport_options: transportOpts,
        is_active: true,
        is_pivot: false,
        created_at: createdAt,
      } as ItineraryNode;
    });

    const allNodes = [...activityNodes, ...fillerNodes, ...transportNodes];

    logger.success(
      "Planner",
      `buildFromSelections — ${activityNodes.length} activities + ${fillerNodes.length} fillers + ${transportNodes.length} transport nodes (tz: ${detectedIANA})`
    );
    return { nodes: allNodes, conflicts: [], timezone: detectedIANA };
  } catch (err) {
    logger.error("Planner", "buildFromSelections failed", (err as Error).message);
    return { nodes: buildFallbackNodes(selected, suggestions, tzOffset), conflicts: [], timezone: detectedIANA };
  }
}

// Fallback: assign placeholder times to selected activities when Gemini fails
function buildFallbackNodes(
  selected: ActivitySuggestion[],
  suggestions: TripSuggestions,
  tzOffset: string
): ItineraryNode[] {
  const createdAt = new Date().toISOString();
  const numDays = Math.ceil(
    (new Date(suggestions.end_date).getTime() - new Date(suggestions.start_date).getTime()) / 86400000
  ) + 1;
  const [y, mo, d] = suggestions.start_date.split("-").map(Number);

  // Distribute activities: up to 4 per day starting at 09:00, 90min apart
  return selected.map((a, i) => {
    const dayIdx = Math.floor(i / 4) % numDays;
    const slotIdx = i % 4;
    const date = new Date(y, mo - 1, d + dayIdx);
    const dateStr = toDateStr(date);
    const startHour = 9 + slotIdx * 2;
    const endHour = startHour + Math.ceil((a.duration_minutes ?? 90) / 60);
    return {
      id: a.id,
      itinerary_id: "",
      parent_id: undefined,
      branch_label: "A",
      type: a.type === "event" ? "event" : "activity",
      title: a.title,
      description: a.description,
      location: a.location,
      start_time: `${dateStr}T${String(startHour).padStart(2, "0")}:00:00${tzOffset}`,
      end_time: `${dateStr}T${String(endHour).padStart(2, "0")}:00:00${tzOffset}`,
      duration_minutes: a.duration_minutes ?? 90,
      budget_tier: a.budget_tier as ItineraryNode["budget_tier"],
      budget_estimate: a.budget_estimate,
      why_selected: a.why_selected,
      tags: a.tags,
      accessibility_verified: a.accessibility_verified,
      accessibility_notes: a.accessibility_notes ?? "",
      booking_links: a.booking_links ?? [],
      transport_options: [],
      is_active: true,
      is_pivot: false,
      created_at: createdAt,
    } as ItineraryNode;
  });
}

// ── Food: find authentic local restaurants per city ──────────
export async function findFoodPlaces(
  cities: string[],
  dateRange: { start: string; end: string },
  userContext: string,
  cityDays: Record<string, number> = {}
): Promise<{ food: FoodSuggestion[] }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} }] as never[],
  });

  const today = TODAY();

  // Scale options per city based on days spent there: days + 3 gives good variety
  const cityInstructions = cities.map((city) => {
    const n = cityDays[city] ?? 1;
    const breakfast = Math.max(3, n + 2);
    const lunch = Math.max(4, n + 3);
    const dinner = Math.max(4, n + 3);
    const snack = Math.max(2, n);
    return `${city} (${n} day${n !== 1 ? "s" : ""}): ${breakfast} breakfast, ${lunch} lunch, ${dinner} dinner, ${snack} snack/street food`;
  }).join("\n  ");

  const prompt = `You are Planit finding authentic local restaurants. Today is ${today}.
${userContext ? `\n${userContext}\n` : ""}

Trip dates: ${dateRange.start} to ${dateRange.end}

AUTHENTICITY RULES (strictly apply all):
- NO restaurants primarily targeting tourists (no "tourist menus" or 5-language signs)
- Prefer family-run, multi-generational, or longtime-local-favorite spots
- Avoid places in "Top 10 Tourist Restaurants" listicles
- Prefer spots where locals go for that specific dish
- Must be open during the trip dates above

Use Google Search:
  - "[city] best [ramen/sushi/etc] locals recommend — not tourist trap"
  - "[city] authentic local restaurants hidden gem [year]"
  - "[city] [meal type] locals actually eat"

For EACH city return exactly the number of options below (more days = more variety to pick from):
  ${cityInstructions}

Return ONLY valid JSON, no markdown:
{
  "food": [
    {
      "id": "tokyo_food_1",
      "city": "Tokyo",
      "title": "Restaurant Name",
      "description": "2–3 sentences about the place and atmosphere",
      "location": { "lat": 35.68, "lng": 139.77, "address": "Full address" },
      "meal_type": "breakfast",
      "cuisine": "Tamago Gohan",
      "must_try_dishes": ["Tamago kake gohan", "Miso soup set"],
      "why_authentic": "Been serving since 1952, cash only, no English menu — packed with office workers at 7am",
      "budget_tier": "budget",
      "budget_estimate": "¥600–900",
      "tags": ["breakfast", "local", "traditional"],
      "accessibility_verified": true,
      "accessibility_notes": "Step at entrance",
      "booking_links": [
        { "platform": "Google Maps", "url": "https://maps.google.com/?q=Restaurant+Tokyo", "label": "View on Google Maps", "category": "restaurant" }
      ],
      "tips": "Arrive before 8am to avoid the queue"
    }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    logger.debug("Planner", `findFoodPlaces raw (first 300): ${raw.slice(0, 300)}`);
    const parsed = extractJSON(raw) as { food?: FoodSuggestion[] } | null;
    if (!parsed?.food?.length) {
      logger.warn("Planner", "findFoodPlaces returned no results");
      return { food: [] };
    }
    logger.success("Planner", `findFoodPlaces — ${parsed.food.length} restaurants across ${cities.length} cities`);
    return { food: parsed.food };
  } catch (err) {
    logger.error("Planner", "findFoodPlaces failed", (err as Error).message);
    return { food: [] };
  }
}
