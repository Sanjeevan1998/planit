import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPlanitEngine } from "@/lib/langgraph/graph";
import { getAllMemories } from "@/lib/supabase/memory";
import { getActiveItinerary } from "@/lib/supabase/itinerary";
import type { PivotRequest } from "@/types";

// ============================================================
// POST /api/location
// Called when user's GPS changes or weather triggers a pivot.
// Checks if the current location deviates from the itinerary
// and triggers the Proactive Pivot agent if needed.
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body: PivotRequest = await req.json();
    const { user_id, itinerary_id, trigger, current_location, weather, context } = body;

    if (!user_id || !current_location) {
      return NextResponse.json({ error: "user_id and current_location are required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch profile and prefs
    const [{ data: userProfile }, { data: accessPrefs }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user_id).single(),
      supabase.from("accessibility_preferences").select("*").eq("user_id", user_id).single(),
    ]);

    const memories = await getAllMemories(user_id);
    const itinerary = itinerary_id
      ? (await supabase.from("itineraries").select("*, nodes:itinerary_nodes(*)").eq("id", itinerary_id).single()).data
      : await getActiveItinerary(user_id);

    if (!itinerary) {
      return NextResponse.json({ requires_pivot: false, message: "No active itinerary" });
    }

    // Check if location deviation warrants a pivot
    let requiresPivot = trigger === "weather" || trigger === "user_request";

    if (trigger === "location_deviation" && itinerary.nodes?.length) {
      // Find the next active node
      const nextNode = itinerary.nodes.find((n: { is_active: boolean }) => n.is_active);
      if (nextNode && nextNode.lat && nextNode.lng) {
        const distanceKm = getDistanceKm(
          current_location.lat,
          current_location.lng,
          nextNode.lat,
          nextNode.lng
        );
        // Trigger pivot if user is more than 2km off course
        requiresPivot = distanceKm > 2;
      }
    }

    if (!requiresPivot) {
      return NextResponse.json({ requires_pivot: false });
    }

    // Run the Proactive Pivot engine
    const engineState = await runPlanitEngine({
      user_id,
      user_profile: userProfile || undefined,
      accessibility_prefs: accessPrefs || undefined,
      user_memories: memories,
      current_location,
      current_time: new Date().toISOString(),
      weather,
      itinerary: itinerary,
      requires_pivot: true,
      pivot_trigger: trigger,
      user_input: context,
      messages: [],
    });

    return NextResponse.json({
      requires_pivot: true,
      voice_message: engineState.response,
      new_nodes: engineState.new_nodes,
      transport_options: engineState.transport_options,
    });
  } catch (error) {
    console.error("[Location API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Haversine distance formula
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
