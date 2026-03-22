/**
 * Planit API service — connects the kawaii frontend to the real Next.js backend.
 * All functions adapt backend responses to the KawaiiXxx types used by the UI layer.
 */

import type {
  KawaiiTripSuggestions,
  KawaiiItinerary,
  KawaiiItineraryNode,
  KawaiiActivity,
  KawaiiFood,
  KawaiiConflict,
} from '@/types/kawaii';
import type { Itinerary, ItineraryNode, TripSuggestions, ActivitySuggestion, FoodSuggestion, ActivityConflict } from '@/types';

// ─── Adapters: backend → kawaii UI types ────────────────────────────────────

function adaptActivitySuggestion(a: ActivitySuggestion): KawaiiActivity {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description,
    budget_tier: a.budget_tier,
    tags: a.tags ?? [],
    why_selected: a.why_selected ?? '',
    image_url: a.image_url ?? '',
    location: a.location?.address ?? '',
    rating: a.rating,
    links: (a.booking_links ?? []).map((bl) => ({ label: bl.label, url: bl.url })),
  };
}

function adaptTripSuggestions(s: TripSuggestions): KawaiiTripSuggestions {
  return {
    trip_title: s.trip_title,
    destination: s.destination,
    start_date: s.start_date,
    end_date: s.end_date,
    cities: (s.cities ?? []).map((c) => ({
      city: c.city,
      date_range: `${c.date_range?.from ?? ''} – ${c.date_range?.to ?? ''}`,
      activities: [...(c.activities ?? []), ...(c.events ?? [])].map(adaptActivitySuggestion),
    })),
  };
}

function adaptNode(n: ItineraryNode): KawaiiItineraryNode {
  const start = n.start_time ? new Date(n.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const end = n.end_time ? new Date(n.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    start_time: start,
    end_time: end,
    location: n.location?.address ?? '',
    description: n.description ?? '',
    image_url: n.image_url ?? '',
    why_selected: n.why_selected ?? '',
    budget_tier: n.budget_tier,
    tags: n.tags ?? [],
    is_pivot: n.is_pivot,
    transport_options: (n.transport_options ?? []).map((t) => ({
      mode: t.mode,
      duration: `${t.duration_minutes} min`,
      cost: t.cost_estimate ?? '',
      notes: t.accessibility_note,
    })),
    links: (n.booking_links ?? []).map((bl) => ({ label: bl.label, url: bl.url })),
  };
}

function adaptItinerary(it: Itinerary): KawaiiItinerary {
  // Group flat nodes by date
  const primaryNodes = it.nodes?.filter((n) => !n.parent_id) ?? [];
  const byDate = new Map<string, ItineraryNode[]>();
  for (const n of primaryNodes) {
    const dateKey = n.start_time ? n.start_time.slice(0, 10) : it.start_date;
    const existing = byDate.get(dateKey) ?? [];
    existing.push(n);
    byDate.set(dateKey, existing);
  }
  const days = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, nodes]) => ({
      date,
      label: `${it.destination} · ${date}`,
      nodes: nodes.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')).map(adaptNode),
    }));

  return {
    id: it.id,
    title: it.title,
    destination: it.destination,
    start_date: it.start_date,
    end_date: it.end_date,
    budget_tier: it.budget_tier,
    days,
  };
}

function adaptFoodSuggestion(f: FoodSuggestion): KawaiiFood {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    cuisine: f.cuisine,
    meal_type: f.meal_type,
    budget_tier: f.budget_tier,
    image_url: '',
    location: f.location?.address ?? '',
    rating: f.rating ?? 0,
    tags: f.tags ?? [],
    why_selected: f.why_authentic ?? '',
    links: (f.booking_links ?? []).map((bl) => ({ label: bl.label, url: bl.url })),
  };
}

function adaptConflict(c: ActivityConflict, idx: number): KawaiiConflict {
  return {
    id: `conflict-${idx}-${c.date}`,
    date: c.date,
    time_slot: c.time_slot,
    options: (c.options ?? []).map(adaptActivitySuggestion),
  };
}

// ─── API calls ───────────────────────────────────────────────────────────────

const BASE = '';  // same-origin Next.js routes

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatResult {
  response: string;
  mode: 'chat' | 'suggest';
  tripSuggestions?: KawaiiTripSuggestions;
}

export async function sendChatMessage(
  message: string,
  userId: string,
  itineraryId?: string,
): Promise<ChatResult> {
  const data = await post<{
    response: string;
    mode?: string;
    trip_suggestions?: TripSuggestions;
  }>('/api/chat', { message, user_id: userId, itinerary_id: itineraryId });

  const hasSuggestions = !!data.trip_suggestions?.cities?.length;

  return {
    response: data.response,
    mode: hasSuggestions ? 'suggest' : 'chat',
    tripSuggestions: hasSuggestions ? adaptTripSuggestions(data.trip_suggestions!) : undefined,
  };
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

export async function getSuggestions(
  message: string,
  userId: string,
): Promise<{ response: string; tripSuggestions: KawaiiTripSuggestions }> {
  const data = await post<{ response: string; trip_suggestions: TripSuggestions }>(
    '/api/itinerary/suggest',
    { message, user_id: userId },
  );
  return {
    response: data.response,
    tripSuggestions: adaptTripSuggestions(data.trip_suggestions),
  };
}

// ─── Build Itinerary ─────────────────────────────────────────────────────────

export interface BuildResult {
  itinerary?: KawaiiItinerary;
  conflicts?: KawaiiConflict[];
}

export async function buildItinerary(
  userId: string,
  selectedIds: string[],
  suggestions: KawaiiTripSuggestions,
  resolvedConflicts?: string[],
): Promise<BuildResult> {
  // Re-hydrate backend TripSuggestions shape from kawaii shape
  const backendSuggestions: TripSuggestions = {
    trip_title: suggestions.trip_title,
    destination: suggestions.destination,
    start_date: suggestions.start_date,
    end_date: suggestions.end_date,
    cities: suggestions.cities.map((c) => ({
      city: c.city,
      date_range: { from: '', to: '' },
      activities: c.activities.map((a) => ({
        id: a.id,
        city: c.city,
        type: a.type as never,
        title: a.title,
        description: a.description,
        location: { lat: 0, lng: 0, address: a.location ?? '' },
        duration_minutes: 60,
        budget_tier: a.budget_tier as never,
        budget_estimate: '',
        tags: a.tags,
        why_selected: a.why_selected,
        accessibility_verified: false,
        booking_links: (a.links ?? []).map((l) => ({
          platform: l.label,
          url: l.url,
          label: l.label,
          category: 'activity' as never,
        })),
        image_url: a.image_url,
        rating: a.rating,
        is_event: false,
      })),
      events: [],
    })),
  };

  const data = await post<{
    itinerary?: Itinerary;
    conflicts?: ActivityConflict[];
  }>('/api/itinerary/build', {
    user_id: userId,
    selected_ids: selectedIds,
    suggestions: backendSuggestions,
    resolved_conflicts: resolvedConflicts,
  });

  if (data.conflicts?.length) {
    return {
      conflicts: data.conflicts.map(adaptConflict),
    };
  }
  if (data.itinerary) {
    return { itinerary: adaptItinerary(data.itinerary) };
  }
  return {};
}

// ─── Finalize Itinerary ───────────────────────────────────────────────────────

export async function finalizeItinerary(
  userId: string,
  itineraryId: string,
  selectedNodeIds: string[],
): Promise<KawaiiItinerary> {
  const data = await post<{ itinerary: Itinerary }>('/api/itinerary/finalize', {
    user_id: userId,
    itinerary_id: itineraryId,
    selected_node_ids: selectedNodeIds,
  });
  return adaptItinerary(data.itinerary);
}

// ─── Food ────────────────────────────────────────────────────────────────────

export async function getFoodSuggestions(
  userId: string,
  cities: string[],
  startDate: string,
  endDate: string,
): Promise<KawaiiFood[]> {
  const data = await post<{ food: FoodSuggestion[] }>('/api/itinerary/food', {
    user_id: userId,
    cities,
    date_range: { start: startDate, end: endDate },
  });
  return (data.food ?? []).map(adaptFoodSuggestion);
}

export async function addFoodToItinerary(
  userId: string,
  itineraryId: string,
  selectedFoodIds: string[],
  foodSuggestions: KawaiiFood[],
): Promise<KawaiiItinerary> {
  // Re-hydrate FoodSuggestion[] for the backend
  const backendFood: FoodSuggestion[] = foodSuggestions.map((f) => ({
    id: f.id,
    city: '',
    title: f.title,
    description: f.description,
    location: { lat: 0, lng: 0, address: f.location },
    meal_type: f.meal_type,
    cuisine: f.cuisine,
    must_try_dishes: [],
    why_authentic: f.why_selected,
    budget_tier: f.budget_tier as never,
    budget_estimate: '',
    tags: f.tags,
    accessibility_verified: false,
    booking_links: (f.links ?? []).map((l) => ({
      platform: l.label,
      url: l.url,
      label: l.label,
      category: 'restaurant' as never,
    })),
    rating: f.rating,
  }));

  const data = await post<{ itinerary: Itinerary }>('/api/itinerary/add-food', {
    user_id: userId,
    itinerary_id: itineraryId,
    selected_food_ids: selectedFoodIds,
    food_suggestions: backendFood,
  });
  return adaptItinerary(data.itinerary);
}

// ─── Memories ────────────────────────────────────────────────────────────────

export async function bootstrapUser(userId: string, name: string): Promise<void> {
  await post('/api/memory', {
    user_id: userId,
    memory: {
      category: 'custom',
      key: 'name',
      value: name,
      source: 'text',
      confidence: 1,
    },
  });
}

export async function getMemories(userId: string) {
  return get<{ memories: unknown[] }>(`/api/memory?user_id=${userId}`);
}
