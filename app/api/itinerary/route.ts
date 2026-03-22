import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveNode, pivotItinerary } from "@/lib/supabase/itinerary";
import type { ItineraryNode } from "@/types";

// ============================================================
// GET /api/itinerary?user_id=...
// Fetch the user's active itinerary with all nodes/branches
// ============================================================
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const itineraryId = searchParams.get("id");

  if (!userId && !itineraryId) {
    return NextResponse.json({ error: "user_id or id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("itineraries")
    .select(`
      *,
      nodes:itinerary_nodes(*)
    `);

  if (itineraryId) {
    query = query.eq("id", itineraryId);
  } else {
    query = query.eq("user_id", userId!).eq("status", "active");
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });
  }

  // Parse JSONB fields from nodes
  if (data.nodes) {
    data.nodes = data.nodes.map((node: Record<string, unknown>) => ({
      ...node,
      booking_links: typeof node.booking_links === "string"
        ? JSON.parse(node.booking_links)
        : node.booking_links,
      transport_options: typeof node.transport_options === "string"
        ? JSON.parse(node.transport_options)
        : node.transport_options,
      location: {
        lat: node.lat,
        lng: node.lng,
        address: node.address,
        place_id: node.place_id,
      },
    }));
  }

  return NextResponse.json(data);
}

// ============================================================
// PATCH /api/itinerary
// Update itinerary state — set active node, pivot, etc.
// ============================================================
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, itinerary_id, node_id, reason, new_nodes } = body;

    if (!itinerary_id) {
      return NextResponse.json({ error: "itinerary_id required" }, { status: 400 });
    }

    switch (action) {
      case "set_active_node": {
        if (!node_id) return NextResponse.json({ error: "node_id required" }, { status: 400 });
        await setActiveNode(itinerary_id, node_id);
        return NextResponse.json({ success: true });
      }

      case "pivot": {
        await pivotItinerary(itinerary_id, reason || "User requested pivot", new_nodes || []);
        return NextResponse.json({ success: true });
      }

      case "complete": {
        const supabase = createAdminClient();
        await supabase
          .from("itineraries")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", itinerary_id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Itinerary PATCH] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================
// POST /api/itinerary
// Create a new itinerary
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, title, destination, start_date, end_date, budget_tier, nodes } = body;

    if (!user_id || !destination) {
      return NextResponse.json({ error: "user_id and destination required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: itinerary, error } = await supabase
      .from("itineraries")
      .insert({
        user_id,
        title: title || `Trip to ${destination}`,
        destination,
        start_date: start_date || new Date().toISOString().split("T")[0],
        end_date: end_date || new Date().toISOString().split("T")[0],
        budget_tier: budget_tier || "mid-range",
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Insert nodes if provided
    if (nodes?.length && itinerary) {
      await supabase.from("itinerary_nodes").insert(
        nodes.map((n: Partial<ItineraryNode>) => ({
          itinerary_id: itinerary.id,
          ...n,
          lat: n.location?.lat,
          lng: n.location?.lng,
          address: n.location?.address,
          booking_links: JSON.stringify(n.booking_links || []),
          transport_options: JSON.stringify(n.transport_options || []),
        }))
      );
    }

    return NextResponse.json(itinerary, { status: 201 });
  } catch (error) {
    console.error("[Itinerary POST] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
