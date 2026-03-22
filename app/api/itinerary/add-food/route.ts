import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { FoodSuggestion } from "@/types";

const VALID_BUDGET_TIERS = new Set(["budget", "mid-range", "premium", "luxury"]);

// Pick N breakfasts + N lunches + N dinners per city (N = numDays)
function autoPickFood(food: FoodSuggestion[], numDays: number): FoodSuggestion[] {
  const cities = [...new Set(food.map((f) => f.city))];
  const picked: FoodSuggestion[] = [];
  for (const city of cities) {
    const cityFood = food.filter((f) => f.city === city);
    const byType = (t: string) => cityFood.filter((f) => f.meal_type === t).slice(0, numDays);
    picked.push(...byType("breakfast"));
    picked.push(...byType("lunch"));
    picked.push(...byType("dinner"));
    picked.push(...byType("snack").slice(0, 1)); // max 1 snack per city
  }
  return picked;
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, itinerary_id, selected_food_ids, food_suggestions, ai_pick, num_days } = await req.json() as {
      user_id: string;
      itinerary_id: string;
      selected_food_ids?: string[];
      food_suggestions: FoodSuggestion[];
      ai_pick?: boolean;
      num_days?: number;
    };

    if (!user_id || !itinerary_id || !food_suggestions?.length) {
      return NextResponse.json({ error: "user_id, itinerary_id, and food_suggestions are required" }, { status: 400 });
    }

    const toAdd: FoodSuggestion[] = ai_pick
      ? autoPickFood(food_suggestions, Math.max(1, num_days ?? 1))
      : food_suggestions.filter((f) => selected_food_ids?.includes(f.id));

    if (!toAdd.length) {
      return NextResponse.json({ error: "No food items selected" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Convert FoodSuggestion → itinerary_nodes row
    // start_time is a placeholder — finalizeWithGemini will assign real times
    const now = new Date().toISOString();
    const mealNodes = toAdd.map((f) => ({
      itinerary_id,
      id: crypto.randomUUID(),
      parent_id: null,
      branch_label: "A",
      type: "meal",
      title: f.title,
      description: f.description,
      lat: f.location.lat,
      lng: f.location.lng,
      address: f.location.address,
      start_time: "1970-01-01T00:00:00+00:00",  // placeholder — finalize will schedule
      end_time: "1970-01-01T01:00:00+00:00",
      duration_minutes: f.meal_type === "snack" ? 30 : f.meal_type === "breakfast" ? 60 : 90,
      budget_tier: VALID_BUDGET_TIERS.has(f.budget_tier) ? f.budget_tier : "mid-range",
      budget_estimate: f.budget_estimate,
      why_selected: f.why_authentic,
      tags: [f.meal_type, ...(f.tags ?? [])],
      accessibility_verified: f.accessibility_verified,
      accessibility_notes: f.accessibility_notes ?? "",
      booking_links: JSON.stringify(f.booking_links),
      transport_options: JSON.stringify([]),
      is_active: true,
      is_pivot: false,
      created_at: now,
    }));

    const { error: insertErr } = await supabase.from("itinerary_nodes").insert(mealNodes);
    if (insertErr) {
      logger.error("AddFood", "Insert failed", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    logger.success("AddFood", `Added ${mealNodes.length} food nodes to itinerary ${itinerary_id}`);

    // Return updated itinerary
    const { data: updated } = await supabase
      .from("itineraries")
      .select("*, nodes:itinerary_nodes(*)")
      .eq("id", itinerary_id)
      .single();

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
    logger.error("AddFood", "Unexpected error", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
