import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewAndFixItinerary } from "@/lib/langgraph/planner";
import { buildReviewTimestamp, nodeCity } from "@/lib/utils/itinerary-helpers";
import { logger } from "@/lib/logger";
import type { TripSuggestions } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { itinerary_id, suggestions } = await req.json() as {
      itinerary_id: string;
      suggestions: TripSuggestions;
    };

    if (!itinerary_id || !suggestions) {
      return NextResponse.json(
        { error: "itinerary_id and suggestions are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch all non-transport nodes — include address for cross-city meal detection
    const { data: rawNodes, error: fetchErr } = await supabase
      .from("itinerary_nodes")
      .select("id, title, tags, type, start_time, end_time, lat, lng, address")
      .eq("itinerary_id", itinerary_id)
      .order("start_time", { ascending: true });

    if (fetchErr || !rawNodes?.length) {
      logger.warn("Review", "No nodes found to review");
      return NextResponse.json({ notes: [], removals: 0, reschedules: 0 });
    }

    const nodesForReview = rawNodes.map((n) => ({
      id: n.id as string,
      title: n.title as string,
      city: nodeCity(n.start_time as string, suggestions.cities),
      address: (n.address as string | null) ?? undefined,
      type: n.type as string,
      start_time: n.start_time as string,
      end_time: n.end_time as string,
    }));

    logger.info("Review", `Reviewing ${nodesForReview.length} nodes for logical consistency`);

    const patch = await reviewAndFixItinerary(nodesForReview, suggestions);

    // Apply removals
    if (patch.removals.length > 0) {
      const { error: delErr } = await supabase
        .from("itinerary_nodes")
        .delete()
        .in("id", patch.removals)
        .eq("itinerary_id", itinerary_id);
      if (delErr) logger.error("Review", "Failed to apply removals", delErr);
      else logger.info("Review", `Removed ${patch.removals.length} impossible nodes`);
    }

    // Apply reschedules
    for (const r of patch.reschedules) {
      const original = rawNodes.find((n) => n.id === r.id);
      const originalTs = (original?.start_time as string) ?? "2000-01-01T00:00:00+00:00";

      const { error: updErr } = await supabase
        .from("itinerary_nodes")
        .update({
          start_time: buildReviewTimestamp(r.new_start, originalTs),
          end_time: buildReviewTimestamp(r.new_end, originalTs),
        })
        .eq("id", r.id)
        .eq("itinerary_id", itinerary_id);
      if (updErr) logger.error("Review", `Failed to reschedule node ${r.id}`, updErr);
    }

    if (patch.reschedules.length > 0) {
      logger.info("Review", `Rescheduled ${patch.reschedules.length} nodes`);
    }

    logger.success(
      "Review",
      `Review complete — ${patch.removals.length} removed, ${patch.reschedules.length} rescheduled`
    );

    return NextResponse.json({
      notes: patch.notes,
      removals: patch.removals.length,
      reschedules: patch.reschedules.length,
    });
  } catch (error) {
    logger.error("Review", "Unexpected error", (error as Error).message);
    // Review errors are non-fatal — return success so the user still sees their itinerary
    return NextResponse.json({ notes: [], removals: 0, reschedules: 0 });
  }
}
