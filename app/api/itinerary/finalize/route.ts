import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeWithGemini } from "@/lib/langgraph/planner";
import { getAllMemories } from "@/lib/supabase/memory";
import { logger } from "@/lib/logger";
import type { ItineraryNode } from "@/types";

// ============================================================
// POST /api/itinerary/finalize
// Takes a list of selected node IDs, calls Gemini to reorder
// them + insert transport nodes between each pair, then
// replaces all nodes in the itinerary.
// ============================================================

const VALID_NODE_TYPES = new Set(["activity", "meal", "transport", "accommodation", "event", "rest", "pivot"]);
const VALID_BUDGET_TIERS = new Set(["budget", "mid-range", "premium", "luxury"]);

function mapNodeForDB(n: unknown, itineraryId: string, idMap: Map<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    id, itinerary_id: _iid, parent_id, location,
    booking_links, transport_options, created_at: _ca,
    ...rest
  } = n as Record<string, unknown>;
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
    const { user_id, itinerary_id, selected_node_ids } = await req.json();

    if (!user_id || !itinerary_id || !selected_node_ids?.length) {
      return NextResponse.json(
        { error: "user_id, itinerary_id, and selected_node_ids are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch itinerary + nodes
    const { data: itinerary, error: fetchErr } = await supabase
      .from("itineraries")
      .select("*, nodes:itinerary_nodes(*)")
      .eq("id", itinerary_id)
      .single();

    if (fetchErr || !itinerary) {
      return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });
    }

    // Filter to selected nodes — includes alternatives (user may pick alt over primary)
    const selectedNodes = (itinerary.nodes ?? []).filter(
      (n: ItineraryNode) => selected_node_ids.includes(n.id)
    );

    if (!selectedNodes.length) {
      return NextResponse.json({ error: "No valid nodes found for the given IDs" }, { status: 400 });
    }

    // Build user context
    const [{ data: userProfile }, { data: accessPrefs }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user_id).single(),
      supabase.from("accessibility_preferences").select("*").eq("user_id", user_id).single(),
    ]);
    const memories = await getAllMemories(user_id);

    const contextLines: string[] = [];
    if (userProfile?.name) contextLines.push(`User: ${userProfile.name}`);
    if (accessPrefs?.uses_wheelchair) contextLines.push("Uses wheelchair — accessible transport required");
    if (accessPrefs?.requires_elevator) contextLines.push("MUST have elevator at every transit stop");
    if (accessPrefs?.low_sensory) contextLines.push("Prefers quiet, low-stimulation environments");
    if (memories.length)
      contextLines.push(`Preferences: ${memories.slice(0, 10).map((m) => `${m.key}=${m.value}`).join(", ")}`);

    logger.info("Finalize", `Finalizing ${selectedNodes.length} activities for itinerary ${itinerary_id}`);

    // Parse transport_options on nodes loaded from DB (stored as JSON strings)
    const parsedNodes = selectedNodes.map((n: Record<string, unknown>) => ({
      ...n,
      transport_options: typeof n.transport_options === "string"
        ? JSON.parse(n.transport_options)
        : n.transport_options,
      booking_links: typeof n.booking_links === "string"
        ? JSON.parse(n.booking_links)
        : n.booking_links,
      location: { lat: n.lat, lng: n.lng, address: n.address },
    }));

    const { nodes: finalizedNodes } = await finalizeWithGemini(
      parsedNodes as ItineraryNode[],
      itinerary.destination ?? "Tokyo",
      contextLines.join("\n")
    );

    if (!finalizedNodes.length) {
      return NextResponse.json({ error: "Finalization returned no nodes" }, { status: 500 });
    }

    // Build UUID map for all nodes
    const idMap = new Map<string, string>();
    for (const n of finalizedNodes) {
      const node = n as unknown as Record<string, unknown>;
      if (typeof node.id === "string") idMap.set(node.id, crypto.randomUUID());
    }

    // Replace all nodes
    await supabase.from("itinerary_nodes").delete().eq("itinerary_id", itinerary_id);

    const { error: insertErr } = await supabase
      .from("itinerary_nodes")
      .insert(finalizedNodes.map((n) => mapNodeForDB(n as unknown, itinerary_id, idMap)));

    if (insertErr) {
      logger.error("Finalize", "Insert failed", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    logger.success("Finalize", `Inserted ${finalizedNodes.length} finalized nodes`);

    // Return updated itinerary
    const { data: updated } = await supabase
      .from("itineraries")
      .select("*, nodes:itinerary_nodes(*)")
      .eq("id", itinerary_id)
      .single();

    // Parse JSONB fields on returned nodes
    if (updated?.nodes) {
      updated.nodes = updated.nodes.map((n: Record<string, unknown>) => ({
        ...n,
        booking_links: typeof n.booking_links === "string" ? JSON.parse(n.booking_links) : n.booking_links,
        transport_options: typeof n.transport_options === "string" ? JSON.parse(n.transport_options) : n.transport_options,
        location: { lat: n.lat, lng: n.lng, address: n.address },
      }));
    }

    return NextResponse.json({ itinerary: updated });
  } catch (error) {
    logger.error("Finalize", "Unexpected error", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
