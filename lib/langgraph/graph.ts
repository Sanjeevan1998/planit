import { StateGraph, END, START } from "@langchain/langgraph";
import { PlanitStateAnnotation } from "./state";
import type { PlanitStateType } from "./state";
import { detectIntent, planWithGemini, pivotWithGemini, chatWithGemini } from "./planner";
import { googleRoutesTool, weatherTool } from "./tools";
import { logger } from "@/lib/logger";

// ============================================================
// PlanitEngine — Streamlined LangGraph Graph
//
// Flow:
//   START → router →
//     ├── plan_day     → plannerNode → END
//     ├── get_commute  → commuteNode → END
//     ├── pivot        → pivotNode   → END
//     └── *            → chatNode    → END
//
// All planning uses Gemini 2.5 Flash with native Google Search
// grounding — one call replaces the old 3-node chain.
// ============================================================

// ── Node: Router (keyword-based, no LLM call) ───────────────
async function routerNode(state: PlanitStateType): Promise<Partial<PlanitStateType>> {
  if (state.requires_pivot) {
    logger.info("Router", "Pivot triggered");
    return { intent: "pivot_itinerary" };
  }
  const input = state.user_input || state.voice_transcript || "";
  const intent = detectIntent(input);
  logger.info("Router", `Intent → ${intent} for: "${input.slice(0, 60)}"`);
  return { intent };
}

function routeIntent(state: PlanitStateType): string {
  if (state.requires_pivot) return "pivot";
  switch (state.intent) {
    case "plan_day":
    case "book_activity":
      return "planner";
    case "get_commute":
      return "commute";
    case "pivot_itinerary":
      return "pivot";
    default:
      return "chat";
  }
}

// ── Node: Planner (Gemini + Google Search grounding) ────────
async function plannerNode(state: PlanitStateType): Promise<Partial<PlanitStateType>> {
  // Fetch weather for context if we have a location
  let weather = state.weather;
  if (!weather && state.current_location) {
    try {
      const w = await weatherTool.invoke({
        lat: state.current_location.lat,
        lng: state.current_location.lng,
      });
      weather = w as PlanitStateType["weather"];
    } catch { /* non-critical */ }
  }

  const { itinerary, response } = await planWithGemini({ ...state, weather });

  return {
    weather,
    itinerary_update: itinerary,
    response: response || "I wasn't able to plan right now — try rephrasing your request.",
    messages: response
      ? [{ role: "assistant", content: response, timestamp: new Date().toISOString() }]
      : [],
  };
}

// ── Node: Commute Specialist ─────────────────────────────────
async function commuteNode(state: PlanitStateType): Promise<Partial<PlanitStateType>> {
  const { current_location, itinerary, active_node_id } = state;

  if (!current_location) {
    return { response: "I need your location to calculate commute options." };
  }

  const activeNode = itinerary?.nodes?.find((n) => n.id === active_node_id || n.is_active);
  if (!activeNode?.location) {
    return { response: "Select an activity first and I'll show you how to get there." };
  }

  const uberUrl = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${activeNode.location.lat}&dropoff[longitude]=${activeNode.location.lng}&dropoff[nickname]=${encodeURIComponent(activeNode.title)}`;

  try {
    const routesResult = await googleRoutesTool.invoke({
      origin: { lat: current_location.lat, lng: current_location.lng },
      destination: { lat: activeNode.location.lat, lng: activeNode.location.lng },
      modes: ["TRANSIT", "DRIVE", "WALK"],
    });

    const options = routesResult.transport_options || [];

    // Always prepend Uber
    options.unshift({
      mode: "uber",
      label: `Uber to ${activeNode.title}`,
      duration_minutes: Math.round((options[0]?.duration_minutes || 20) * 0.85),
      cost_estimate: "~¥1,500–3,000",
      tags: ["fastest"],
      booking_link: { platform: "Uber", url: uberUrl, label: "Open Uber App", category: "transport" },
    });

    const response = `Here are your options to get to **${activeNode.title}**:
${options.map((o) => `• ${o.mode === "uber" ? "🚗" : o.mode === "train" ? "🚇" : "🚶"} ${o.label} — ${o.duration_minutes}min${o.cost_estimate ? ` (${o.cost_estimate})` : ""}${o.accessibility_note ? ` ♿ ${o.accessibility_note}` : ""}`).join("\n")}`;

    return {
      transport_options: options,
      response,
      messages: [{ role: "assistant", content: response, timestamp: new Date().toISOString() }],
    };
  } catch {
    return {
      response: `Here's how to get to ${activeNode.title}: [Open Uber](${uberUrl})`,
      transport_options: [],
    };
  }
}

// ── Node: Proactive Pivot ────────────────────────────────────
async function pivotNode(state: PlanitStateType): Promise<Partial<PlanitStateType>> {
  const { voice_message, new_nodes } = await pivotWithGemini(state);
  return {
    response: voice_message,
    new_nodes,
    requires_pivot: false,
    messages: [{ role: "assistant", content: voice_message, timestamp: new Date().toISOString() }],
  };
}

// ── Node: General Chat ───────────────────────────────────────
async function chatNode(state: PlanitStateType): Promise<Partial<PlanitStateType>> {
  const useSearch = state.intent === "find_nearby";
  const { response, memory_updates } = await chatWithGemini(state, useSearch);
  return {
    response,
    memory_updates: memory_updates as PlanitStateType["memory_updates"],
    messages: [
      { role: "user", content: state.user_input || "", timestamp: new Date().toISOString() },
      { role: "assistant", content: response, timestamp: new Date().toISOString() },
    ],
  };
}

// ── Build graph ──────────────────────────────────────────────
function buildPlanitGraph() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workflow = new StateGraph(PlanitStateAnnotation) as any;

  workflow.addNode("router",   routerNode);
  workflow.addNode("planner",  plannerNode);
  workflow.addNode("commute",  commuteNode);
  workflow.addNode("pivot",    pivotNode);
  workflow.addNode("chat",     chatNode);

  workflow.addEdge(START, "router");

  workflow.addConditionalEdges("router", routeIntent, {
    planner: "planner",
    commute: "commute",
    pivot:   "pivot",
    chat:    "chat",
  });

  workflow.addEdge("planner", END);
  workflow.addEdge("commute", END);
  workflow.addEdge("pivot",   END);
  workflow.addEdge("chat",    END);

  return workflow.compile();
}

let _graph: ReturnType<typeof buildPlanitGraph> | null = null;

export function getPlanitGraph() {
  if (!_graph) _graph = buildPlanitGraph();
  return _graph;
}

export async function runPlanitEngine(
  input: Partial<PlanitStateType>
): Promise<PlanitStateType> {
  const graph = getPlanitGraph();
  const result = await graph.invoke({
    user_id: "",
    user_memories: [],
    current_time: new Date().toISOString(),
    messages: [],
    requires_pivot: false,
    ...input,
  });
  return result as PlanitStateType;
}
