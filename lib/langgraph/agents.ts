import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { PlanitStateType } from "./state";
import type { ItineraryNode, TransportOption, UserMemory } from "@/types";
import { logger, extractJSON } from "@/lib/logger";
import {
  tavilySearchTool,
  googlePlacesTool,
  googleRoutesTool,
  weatherTool,
  bookingLinkTool,
} from "./tools";

// ============================================================
// Shared Gemini instance (lazy — only created on first use)
// ============================================================
let _gemini: ChatGoogleGenerativeAI | null = null;
function getGemini(): ChatGoogleGenerativeAI {
  if (!_gemini) {
    _gemini = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      temperature: 0.7,
      maxOutputTokens: 4096,
    });
  }
  return _gemini;
}

// ============================================================
// NODE 1: Contextualizer
// Pulls user memory, current GPS, weather, and accessibility flags.
// Enriches the state before any planning begins.
// ============================================================
export async function contextualizerNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const { user_profile, accessibility_prefs, user_memories, current_location, weather } = state;

  // Build a rich context summary for the LLM
  const memoryContext = user_memories
    .slice(0, 20)
    .map((m) => `[${m.category}] ${m.key}: ${m.value}`)
    .join("\n");

  const accessContext = accessibility_prefs
    ? [
        accessibility_prefs.uses_cane && "Uses a cane",
        accessibility_prefs.uses_wheelchair && "Uses a wheelchair",
        accessibility_prefs.requires_elevator && "Requires elevator access",
        accessibility_prefs.low_sensory && "Prefers low-sensory environments",
        accessibility_prefs.light_sensitivity && "Has light sensitivity",
        ...(accessibility_prefs.allergies || []).map(
          (a) => `Allergy (${a.severity}): ${a.item}`
        ),
        ...(accessibility_prefs.dietary_restrictions || []).map(
          (d) => `Dietary: ${d.label}`
        ),
      ]
        .filter(Boolean)
        .join(", ")
    : "No accessibility preferences set";

  const weatherContext = weather
    ? `${weather.condition}, ${weather.temperature_celsius}°C — ${weather.description}`
    : "Weather unknown";

  const locationContext = current_location
    ? `${current_location.city || "Unknown city"} (${current_location.lat.toFixed(4)}, ${current_location.lng.toFixed(4)})`
    : "Location not available";

  const systemPrompt = `You are Planit, an adaptive AI travel sidekick.
Current user: ${user_profile?.name || "Traveler"}
Location: ${locationContext}
Weather: ${weatherContext}
Accessibility: ${accessContext}
Known preferences:\n${memoryContext || "None yet"}

Use this context to understand the user and their needs.`;

  // Classify intent from user input
  const userInput = state.user_input || state.voice_transcript || "";
  let intent: PlanitStateType["intent"] = "general_chat";

  if (userInput) {
    logger.info("Contextualizer", `Classifying intent for: "${userInput}"`);
    const intentResponse = await getGemini().invoke([
      new SystemMessage(
        `Classify the user's intent. Reply with ONLY one of: onboard, plan_day, get_commute, find_nearby, pivot_itinerary, update_memory, book_activity, general_chat`
      ),
      new HumanMessage(userInput),
    ]);
    const intentText = (intentResponse.content as string).trim().toLowerCase();
    const validIntents: PlanitStateType["intent"][] = [
      "onboard",
      "plan_day",
      "get_commute",
      "find_nearby",
      "pivot_itinerary",
      "update_memory",
      "book_activity",
      "general_chat",
    ];
    if (validIntents.includes(intentText as PlanitStateType["intent"])) {
      intent = intentText as PlanitStateType["intent"];
    }
    logger.success("Contextualizer", `Intent → ${intent} (raw: "${intentText}")`);
  }

  return {
    intent,
    messages: [
      {
        role: "system",
        content: systemPrompt,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ============================================================
// NODE 2: Commute Specialist
// Generates all transport options for the next destination.
// Tags each: Fastest, Cheapest, Most Accessible.
// ============================================================
export async function commuteSpecialistNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const { current_location, itinerary, active_node_id, accessibility_prefs, user_input } = state;

  if (!current_location) {
    return { response: "I need your location to calculate commute options." };
  }

  // Find the destination — either from active node or from user input
  let destLat = 0;
  let destLng = 0;
  let destName = "your destination";

  if (active_node_id && itinerary) {
    const activeNode = itinerary.nodes.find((n) => n.id === active_node_id);
    if (activeNode) {
      destLat = activeNode.location.lat;
      destLng = activeNode.location.lng;
      destName = activeNode.title;
    }
  }

  if (destLat === 0 && user_input) {
    // Search for the destination from the user's query
    const placesResult = await googlePlacesTool.invoke({
      query: user_input,
      location: { lat: current_location.lat, lng: current_location.lng },
    });
    if (placesResult.places?.length > 0) {
      const place = placesResult.places[0];
      destLat = place.location.lat;
      destLng = place.location.lng;
      destName = place.name;
    }
  }

  if (destLat === 0) {
    return { response: "I couldn't find the destination. Could you be more specific?" };
  }

  // Get routes
  const routesResult = await googleRoutesTool.invoke({
    origin: { lat: current_location.lat, lng: current_location.lng },
    destination: { lat: destLat, lng: destLng },
    modes: ["TRANSIT", "DRIVE", "WALK"],
  });

  let transportOptions: TransportOption[] = routesResult.transport_options || [];

  // Apply accessibility filter
  if (accessibility_prefs?.requires_elevator) {
    transportOptions = transportOptions.map((opt) => {
      if (opt.mode === "train" || opt.mode === "subway") {
        return {
          ...opt,
          accessibility_note: "Check for elevator access at each station before boarding",
          tags: [...opt.tags, "most_accessible" as const],
        };
      }
      return opt;
    });
  }

  // Add Uber option always
  const uberOption: TransportOption = {
    mode: "uber",
    label: `Uber to ${destName}`,
    duration_minutes: Math.round(transportOptions[0]?.duration_minutes * 0.8 || 15),
    cost_estimate: "~¥1,500–3,000",
    tags: ["fastest"],
    booking_link: {
      platform: "Uber",
      url: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${destLat}&dropoff[longitude]=${destLng}&dropoff[nickname]=${encodeURIComponent(destName)}`,
      label: "Open Uber App",
      category: "transport",
    },
  };
  transportOptions.unshift(uberOption);

  const llmResponse = await getGemini().invoke([
    new SystemMessage(
      `You are Planit's Commute Specialist. Generate a helpful, concise response about getting to ${destName}.
      Mention the accessibility features if relevant.
      ${accessibility_prefs?.requires_elevator ? "The user requires elevator access — highlight which option is most accessible." : ""}`
    ),
    new HumanMessage(
      `User wants to get to: ${destName}\nAvailable options: ${JSON.stringify(transportOptions, null, 2)}`
    ),
  ]);

  return {
    transport_options: transportOptions,
    response: llmResponse.content as string,
    messages: [
      {
        role: "assistant",
        content: llmResponse.content as string,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ============================================================
// NODE 3: Live Event Scout
// Searches for real-time nearby events, pop-ups, festivals.
// Uses Tavily for live web results.
// ============================================================
export async function liveEventScoutNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const { current_location, user_memories, accessibility_prefs, itinerary } = state;

  const city = current_location?.city || itinerary?.destination || "Tokyo";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build query from user preferences
  const vibeMemories = user_memories
    .filter((m) => m.category === "vibe" || m.category === "activity")
    .map((m) => m.value)
    .slice(0, 3)
    .join(", ");

  const accessFilter = [
    accessibility_prefs?.low_sensory && "quiet OR low-sensory",
    accessibility_prefs?.requires_elevator && "wheelchair accessible",
    accessibility_prefs?.uses_cane && "accessible entrance",
  ]
    .filter(Boolean)
    .join(" ");

  const query = `${city} events today ${today} ${vibeMemories} ${accessFilter}`.trim();

  const searchResult = await tavilySearchTool.invoke({ query, max_results: 8 });

  // Also search Google Places for nearby activities
  const placesResult = current_location
    ? await googlePlacesTool.invoke({
        query: `${vibeMemories || "interesting place"} in ${city}`,
        location: { lat: current_location.lat, lng: current_location.lng },
        radius_meters: 3000,
      })
    : { places: [] };

  return {
    search_results: searchResult.results || [],
    places_data: placesResult.places || [],
  };
}

// ============================================================
// NODE 4: Detailer / Itinerary Builder
// Produces a high-density JSON itinerary with all fields filled.
// Generates "Why this?" tags and booking links for every node.
// ============================================================
export async function detailerNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const {
    user_profile,
    user_memories,
    accessibility_prefs,
    search_results,
    places_data,
    itinerary,
    user_input,
    current_location,
    weather,
  } = state;

  const memoryContext = user_memories
    .slice(0, 15)
    .map((m) => `${m.key}: ${m.value}`)
    .join("; ");

  const accessSummary = accessibility_prefs
    ? [
        accessibility_prefs.low_sensory && "prefers quiet/low-sensory spaces",
        accessibility_prefs.requires_elevator && "needs elevator access",
        accessibility_prefs.uses_cane && "uses a cane",
        ...(accessibility_prefs.allergies || []).map((a) => `allergic to ${a.item}`),
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const systemPrompt = `You are Planit's Detailer agent. Your job is to create a detailed, structured itinerary in JSON format.

User: ${user_profile?.name || "Traveler"}
User preferences: ${memoryContext}
Accessibility needs: ${accessSummary || "None"}
Current location: ${current_location?.city || itinerary?.destination || "Tokyo"}
Weather: ${weather ? `${weather.condition}, ${weather.temperature_celsius}°C` : "Unknown"}

Rules:
1. Every activity must have a "why_selected" field explaining how it matches user preferences
2. Every activity must have at least 2 booking_links
3. Flag is_pivot=true if this replaces a cancelled activity
4. Include accessibility_notes for any place the user needs to navigate
5. Respect allergies — exclude any place that serves the allergen prominently
6. Budget must match user's budget_tier preference

Return a JSON object with this structure:
{
  "title": "...",
  "nodes": [
    {
      "id": "node_1",
      "parent_id": null,
      "branch_label": "A",
      "type": "activity|meal|transport|accommodation|event",
      "title": "...",
      "description": "...",
      "location": { "lat": 0, "lng": 0, "address": "..." },
      "start_time": "ISO8601",
      "end_time": "ISO8601",
      "duration_minutes": 90,
      "budget_tier": "mid-range",
      "budget_estimate": "¥2,500",
      "why_selected": "...",
      "tags": ["quiet", "outdoor"],
      "accessibility_verified": true,
      "accessibility_notes": "...",
      "booking_links": [
        { "platform": "...", "url": "...", "label": "...", "category": "..." }
      ],
      "transport_options": [],
      "is_active": true,
      "is_pivot": false
    }
  ],
  "branches": [
    {
      "id": "branch_b",
      "parent_node_id": "node_1",
      "label": "B",
      "theme": "Splurge",
      "nodes": [...],
      "is_active": false
    }
  ]
}`;

  const contextData = {
    user_request: user_input,
    search_results: search_results?.slice(0, 5),
    places: places_data?.slice(0, 6),
  };

  logger.info("Detailer", "Generating itinerary...", {
    user_request: contextData.user_request,
    places_count: contextData.places?.length,
    search_results_count: contextData.search_results?.length,
  });

  const response = await getGemini().invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `Create a detailed itinerary based on this context:\n${JSON.stringify(contextData, null, 2)}\n\nIMPORTANT: Return ONLY a raw JSON object. No markdown, no code fences, no explanation.`
    ),
  ]);

  const rawContent = response.content as string;
  logger.debug("Detailer", `Raw LLM response (first 300 chars): ${rawContent.slice(0, 300)}`);

  let itineraryData: Partial<typeof itinerary> = {};
  const parsed = extractJSON(rawContent);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    itineraryData = parsed as Partial<typeof itinerary>;
  } else {
    logger.warn("Detailer", "JSON extraction failed", rawContent.slice(0, 200));
  }

  const nodeCount = (itineraryData as { nodes?: unknown[] })?.nodes?.length || 0;
  logger.success("Detailer", `Parsed itinerary — ${nodeCount} nodes`);

  const userFacingResponse = nodeCount > 0
    ? `I've planned your day! Here's what I've got — ${nodeCount} activities. You can see them in the timeline on the right, and switch between branches for alternatives.`
    : "I wasn't able to build the itinerary right now. Try asking again or be more specific about the destination.";

  return {
    itinerary_update: itineraryData as Partial<PlanitStateType["itinerary"]>,
    response: userFacingResponse,
    messages: [
      {
        role: "assistant",
        content: userFacingResponse,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ============================================================
// NODE 5: Brancher
// Creates 2-3 alternative "What if?" paths for every activity.
// ============================================================
export async function brancherNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const { itinerary_update, user_memories, accessibility_prefs } = state;

  const currentNodes = (itinerary_update as { nodes?: unknown[] } | undefined)?.nodes;
  if (!currentNodes?.length) {
    return {};
  }

  const memSummary = user_memories
    .slice(0, 10)
    .map((m) => `${m.key}: ${m.value}`)
    .join("; ");

  const systemPrompt = `You are Planit's Brancher. For each main activity node, generate 2 alternative branches.
Each branch should represent a distinct "vibe" or preference path:
- Branch B: A "Splurge" or premium alternative
- Branch C: A different category (shopping, culture, foodie, etc.)

User preferences: ${memSummary}
Accessibility: ${accessibility_prefs?.requires_elevator ? "Requires elevator" : ""} ${accessibility_prefs?.low_sensory ? "Prefers quiet spaces" : ""}

Return JSON with additional branch objects to add to the itinerary.
Each branch node must have all required fields including booking_links and why_selected.`;

  const response = await getGemini().invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `Generate branches for these nodes:\n${JSON.stringify(currentNodes.slice(0, 3), null, 2)}\n\nReturn ONLY JSON array of branch objects.`
    ),
  ]);

  let branches: unknown[] = [];
  try {
    const content = response.content as string;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      branches = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // If JSON parse fails, keep empty branches
  }

  return {
    itinerary_update: {
      ...(itinerary_update as object),
      branches,
    } as PlanitStateType["itinerary_update"],
  };
}

// ============================================================
// NODE 6: Proactive Pivot Agent
// Detects weather/location changes and auto-regenerates plans.
// ============================================================
export async function proactivePivotNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const {
    itinerary,
    current_location,
    weather,
    pivot_trigger,
    user_profile,
    accessibility_prefs,
    user_memories,
  } = state;

  if (!itinerary) return {};

  const trigger = pivot_trigger || "user_request";
  const triggerMessage = {
    weather: `It just started ${weather?.condition || "raining"}`,
    location_deviation: "You've deviated from the planned route",
    user_request: "You've requested a change",
    time_overrun: "You're running behind schedule",
  }[trigger];

  const prefs = user_memories
    .filter((m) => m.category === "vibe" || m.category === "dislikes" || m.category === "likes")
    .map((m) => `${m.key}: ${m.value}`)
    .join("; ");

  const systemPrompt = `You are Planit's Proactive Pivot Agent. ${triggerMessage}.

User: ${user_profile?.name || "Traveler"}
Situation: ${weather ? `${weather.condition}, ${weather.temperature_celsius}°C` : ""} ${current_location ? `at ${current_location.city}` : ""}
User preferences: ${prefs}
${accessibility_prefs?.low_sensory ? "Prefers quiet indoor spaces" : ""}
${accessibility_prefs?.requires_elevator ? "Needs elevator access" : ""}

Generate a pivot message and 2-3 alternative indoor activities.
Speak in first person as Planit, warmly and concisely.
Format response as JSON:
{
  "voice_message": "Hey [name], it just started raining...",
  "pivot_nodes": [...],
  "pruned_node_ids": ["id1", "id2"]
}`;

  // Search for alternatives
  const city = current_location?.city || itinerary.destination;
  const searchQuery = weather?.condition === "rainy" || weather?.condition === "stormy"
    ? `indoor activities ${city} ${accessibility_prefs?.low_sensory ? "quiet" : ""}`
    : `alternatives to current plan ${city}`;

  const searchResult = await tavilySearchTool.invoke({
    query: searchQuery,
    max_results: 5,
  });

  const response = await getGemini().invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `Current itinerary: ${JSON.stringify(itinerary.nodes?.slice(0, 3), null, 2)}\nSearch results: ${JSON.stringify(searchResult.results?.slice(0, 3), null, 2)}\n\nReturn ONLY valid JSON.`
    ),
  ]);

  let pivotData: { voice_message?: string; pivot_nodes?: ItineraryNode[] } = {};
  try {
    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      pivotData = JSON.parse(jsonMatch[0]);
    }
  } catch {
    pivotData = { voice_message: response.content as string };
  }

  return {
    response: pivotData.voice_message,
    new_nodes: pivotData.pivot_nodes || [],
    requires_pivot: false,
    messages: [
      {
        role: "assistant",
        content: pivotData.voice_message || "I've found some alternatives for you.",
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ============================================================
// NODE 7: Memory Updater
// Processes feedback ("that place was too dark") and updates
// the user's persistent memory profile.
// ============================================================
export async function memoryUpdaterNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const { user_input, voice_transcript, user_memories } = state;
  const feedback = user_input || voice_transcript || "";

  if (!feedback) return {};

  const response = await getGemini().invoke([
    new SystemMessage(
      `You are Planit's Memory Updater. Extract memory updates from user feedback.
Return a JSON array of memory objects:
[
  {
    "category": "dislikes|likes|vibe|budget|accessibility|activity|custom",
    "key": "snake_case_key",
    "value": "descriptive value",
    "source": "feedback",
    "confidence": 0.9
  }
]
Only return JSON array, no other text.`
    ),
    new HumanMessage(`User said: "${feedback}"\nExisting memories: ${user_memories.slice(0, 10).map((m) => `${m.key}: ${m.value}`).join(", ")}`),
  ]);

  let memoryUpdates: Partial<UserMemory>[] = [];
  try {
    const content = response.content as string;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      memoryUpdates = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Parse failed
  }

  const ackResponse = await getGemini().invoke([
    new SystemMessage("You are Planit. Acknowledge the user's feedback warmly in 1 sentence. Don't say 'Okay' — be specific."),
    new HumanMessage(`User feedback: "${feedback}". I'm updating their preferences: ${memoryUpdates.map((m) => `${m.key}: ${m.value}`).join(", ")}`),
  ]);

  return {
    memory_updates: memoryUpdates,
    response: ackResponse.content as string,
    messages: [
      {
        role: "assistant",
        content: ackResponse.content as string,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ============================================================
// NODE 8: General Chat / Onboarding
// Handles conversational requests and initial onboarding.
// ============================================================
export async function generalChatNode(
  state: PlanitStateType
): Promise<Partial<PlanitStateType>> {
  const {
    messages,
    user_input,
    voice_transcript,
    user_profile,
    accessibility_prefs,
    itinerary,
  } = state;

  const input = user_input || voice_transcript || "";
  const isOnboarding = !user_profile?.name || state.intent === "onboard";

  const systemContent = isOnboarding
    ? `You are Planit, a warm and intelligent AI travel sidekick. This is the user's first time.
Your goal is to learn about them through natural conversation:
1. Their name
2. Where they're traveling
3. Any accessibility needs (mobility, dietary, sensory)
4. Budget preference (budget/mid-range/luxury)
5. Travel vibe (adventure, relaxation, culture, foodie)

Be conversational, not like a form. Extract memories naturally.
After gathering info, confirm: "Got it! Let me remember all that..."
Return JSON:
{
  "response": "conversational reply",
  "extracted_memories": [{"category": "...", "key": "...", "value": "..."}],
  "profile_updates": {"name": "...", "persona": "..."}
}`
    : `You are Planit, the user's AI travel sidekick.
User: ${user_profile?.name || "Traveler"}
Active itinerary: ${itinerary?.title || "None"}
${accessibility_prefs?.low_sensory ? "Note: User prefers quiet spaces" : ""}

Be helpful, concise, and warm. Reference their preferences when relevant.`;

  const chatMessages = [
    new SystemMessage(systemContent),
    ...messages.slice(-6).map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new SystemMessage(m.content)
    ),
    new HumanMessage(input),
  ];

  const response = await getGemini().invoke(chatMessages);
  const content = response.content as string;

  let memoryUpdates: Partial<UserMemory>[] = [];
  let profileUpdates: Partial<typeof user_profile> = {};
  let responseText = content;

  if (isOnboarding) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        responseText = parsed.response || content;
        memoryUpdates = parsed.extracted_memories || [];
        profileUpdates = parsed.profile_updates || {};
      }
    } catch {
      // Use raw content if JSON parse fails
    }
  }

  return {
    response: responseText,
    memory_updates: memoryUpdates,
    messages: [
      {
        role: "user",
        content: input,
        timestamp: new Date().toISOString(),
      },
      {
        role: "assistant",
        content: responseText,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ============================================================
// Tool Node (for direct tool calls within the graph)
// ============================================================
export const toolNode = new ToolNode([
  tavilySearchTool,
  googlePlacesTool,
  googleRoutesTool,
  weatherTool,
  bookingLinkTool,
]);
