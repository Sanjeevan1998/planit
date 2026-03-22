import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFromSelections, buildUserContextFromRaw } from "@/lib/langgraph/planner";
import { getAllMemories } from "@/lib/supabase/memory";
import { logger } from "@/lib/logger";
import type { TripSuggestions } from "@/types";

const VALID_NODE_TYPES = new Set(["activity", "meal", "transport", "accommodation", "event", "rest", "pivot"]);
const VALID_BUDGET_TIERS = new Set(["budget", "mid-range", "premium", "luxury"]);

function mapNodeForDB(n: unknown, itineraryId: string, idMap: Map<string, string>) {
  // Destructure ALL fields that we either replace or don't want in the DB spread
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, itinerary_id: _iid, parent_id, location, booking_links, transport_options, created_at: _ca, ...rest } = n as Record<string, unknown>;
  const loc = location as Record<string, unknown> | undefined;
  return {
    itinerary_id: itineraryId,
    id: idMap.get(id as string) ?? crypto.randomUUID(),
    parent_id: parent_id ? (idMap.get(parent_id as string) ?? null) : null,
    lat: loc?.lat ?? rest.lat ?? 0,
    lng: loc?.lng ?? rest.lng ?? 0,
    address: loc?.address ?? rest.address ?? "",
    booking_links: JSON.stringify(booking_links ?? []),
    transport_options: JSON.stringify(transport_options ?? []),
    ...rest,
    type: VALID_NODE_TYPES.has(rest.type as string) ? rest.type : "activity",
    budget_tier: VALID_BUDGET_TIERS.has(rest.budget_tier as string) ? rest.budget_tier : "mid-range",
  };
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, selected_ids, suggestions, resolved_conflicts } = await req.json() as {
      user_id: string;
      selected_ids: string[];
      suggestions: TripSuggestions;
      resolved_conflicts?: string[];
    };

    if (!user_id || !selected_ids?.length || !suggestions) {
      return NextResponse.json({ error: "user_id, selected_ids, and suggestions are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const [{ data: userProfile }, { data: accessPrefs }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user_id).single(),
      supabase.from("accessibility_preferences").select("*").eq("user_id", user_id).single(),
    ]);
    const memories = await getAllMemories(user_id);

    const userContext = buildUserContextFromRaw({
      name: userProfile?.name,
      wheelchair: accessPrefs?.uses_wheelchair,
      elevator: accessPrefs?.requires_elevator,
      lowSensory: accessPrefs?.low_sensory,
      allergies: accessPrefs?.allergies,
      memories: memories.map((m) => ({ key: m.key, value: m.value })),
    });

    // Effective IDs: original selection minus conflicting losers
    const resolvedSet = new Set(resolved_conflicts ?? []);
    // Get all conflicting IDs from the suggestion bundle's events
    const allActivities = suggestions.cities.flatMap((c) => [...c.activities, ...c.events]);
    // If resolved_conflicts provided, only keep those from conflicting events (plus all non-events)
    const effectiveIds = resolved_conflicts
      ? selected_ids.filter((id) => {
          const act = allActivities.find((a) => a.id === id);
          if (!act?.is_event) return true; // keep all non-events
          // For events: keep if in resolvedSet or not involved in a conflict
          return resolvedSet.has(id);
        })
      : selected_ids;

    logger.info("Build", `Building itinerary from ${effectiveIds.length} selected activities`);

    const { nodes, conflicts, timezone } = await buildFromSelections(effectiveIds, suggestions, userContext);

    // Return conflicts for resolution — don't write to DB yet
    if (conflicts.length > 0) {
      logger.info("Build", `Found ${conflicts.length} scheduling conflicts`);
      return NextResponse.json({ conflicts });
    }

    if (!nodes.length) {
      return NextResponse.json({ error: "Could not schedule activities — try selecting fewer or different activities" }, { status: 500 });
    }

    // Deactivate any existing active itinerary for this user
    await supabase
      .from("itineraries")
      .update({ status: "completed" })
      .eq("user_id", user_id)
      .eq("status", "active");

    // Create new itinerary in DB
    const { data: newItinerary, error: iErr } = await supabase
      .from("itineraries")
      .insert({
        user_id,
        title: suggestions.trip_title,
        destination: suggestions.destination,
        start_date: suggestions.start_date,
        end_date: suggestions.end_date,
        budget_tier: "mid-range",
        status: "active",
        timezone,
      })
      .select()
      .single();

    if (iErr || !newItinerary) {
      logger.error("Build", "Failed to create itinerary", iErr);
      return NextResponse.json({ error: "Failed to create itinerary" }, { status: 500 });
    }

    // Map nodes to UUIDs + insert
    const idMap = new Map<string, string>();
    for (const n of nodes) {
      const node = n as unknown as Record<string, unknown>;
      if (typeof node.id === "string") {
        idMap.set(node.id, crypto.randomUUID());
      }
    }

    const { error: nodesErr } = await supabase
      .from("itinerary_nodes")
      .insert(nodes.map((n) => mapNodeForDB(n as unknown, newItinerary.id, idMap)));

    if (nodesErr) {
      logger.error("Build", "Failed to insert nodes", nodesErr);
      return NextResponse.json({ error: nodesErr.message }, { status: 500 });
    }

    logger.success("Build", `Created itinerary ${newItinerary.id} with ${nodes.length} nodes`);

    // Return itinerary with parsed nodes
    const { data: fullItinerary } = await supabase
      .from("itineraries")
      .select("*, nodes:itinerary_nodes(*)")
      .eq("id", newItinerary.id)
      .single();

    if (fullItinerary?.nodes) {
      fullItinerary.nodes = fullItinerary.nodes.map((n: Record<string, unknown>) => ({
        ...n,
        booking_links: typeof n.booking_links === "string" ? JSON.parse(n.booking_links) : n.booking_links,
        transport_options: typeof n.transport_options === "string" ? JSON.parse(n.transport_options) : n.transport_options,
        location: { lat: n.lat, lng: n.lng, address: n.address },
      }));
    }

    return NextResponse.json({ itinerary_id: newItinerary.id, itinerary: fullItinerary });
  } catch (error) {
    logger.error("Build", "Unexpected error", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
