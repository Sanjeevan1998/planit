import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type {
  UserProfile,
  AccessibilityPreferences,
  UserMemory,
  Itinerary,
  ItineraryNode,
  UserLocation,
  WeatherContext,
  SearchResult,
  PlaceData,
  TransportOption,
  PlanitIntent,
  AgentMessage,
} from "@/types";

// ============================================================
// PlanitEngine — LangGraph State Annotation
// This is the single shared state object passed between all
// nodes in the graph. Each node reads from and writes to this.
// ============================================================

export const PlanitStateAnnotation = Annotation.Root({
  // ----- User Context ----------------------------------------
  user_id: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  user_profile: Annotation<UserProfile | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  accessibility_prefs: Annotation<AccessibilityPreferences | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  user_memories: Annotation<UserMemory[]>({
    reducer: (current, next) => {
      // Merge: deduplicate by key, prefer newer entries
      const map = new Map(current.map((m) => [m.key, m]));
      for (const m of next) map.set(m.key, m);
      return Array.from(map.values());
    },
    default: () => [],
  }),

  // ----- Location & Time -------------------------------------
  current_location: Annotation<UserLocation | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  current_time: Annotation<string>({
    reducer: (_, next) => next,
    default: () => new Date().toISOString(),
  }),

  // ----- Environment -----------------------------------------
  weather: Annotation<WeatherContext | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ----- Active Itinerary ------------------------------------
  itinerary: Annotation<Itinerary | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  active_node_id: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ----- Conversation ----------------------------------------
  messages: Annotation<AgentMessage[]>({
    reducer: (current, next) => [...current, ...next],
    default: () => [],
  }),
  user_input: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  voice_transcript: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ----- Intent / Routing ------------------------------------
  intent: Annotation<PlanitIntent | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  requires_pivot: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  pivot_trigger: Annotation<"weather" | "location_deviation" | "user_request" | "time_overrun" | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ----- Tool / Intermediate Results -------------------------
  search_results: Annotation<SearchResult[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  places_data: Annotation<PlaceData[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  transport_options: Annotation<TransportOption[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  new_nodes: Annotation<ItineraryNode[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ----- Itinerary update (staged before persist) ------------
  itinerary_update: Annotation<Partial<Itinerary> | undefined>({
    reducer: (current, next) => (next !== undefined ? { ...(current || {}), ...next } : current),
    default: () => undefined,
  }),

  // ----- Output ----------------------------------------------
  response: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  memory_updates: Annotation<Partial<UserMemory>[]>({
    reducer: (current, next) => [...current, ...next],
    default: () => [],
  }),
  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type PlanitStateType = typeof PlanitStateAnnotation.State;
