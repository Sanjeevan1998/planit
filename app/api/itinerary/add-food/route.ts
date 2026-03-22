import { NextRequest, NextResponse } from "next/server";
import { find as geoFind } from "geo-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { ianaToOffset } from "@/lib/langgraph/planner";
import { logger } from "@/lib/logger";
import type { FoodSuggestion } from "@/types";

const VALID_BUDGET_TIERS = new Set(["budget", "mid-range", "premium", "luxury"]);

// Meal time slots: start/end in HH:MM
const MEAL_SLOTS: Record<string, { start: string; end: string; durationMin: number }> = {
  breakfast: { start: "07:30", end: "08:30", durationMin: 60 },
  lunch:     { start: "12:00", end: "13:30", durationMin: 90 },
  dinner:    { start: "18:30", end: "20:00", durationMin: 90 },
  snack:     { start: "15:00", end: "15:30", durationMin: 30 },
};

// Build YYYY-MM-DD string without timezone drift
function addDays(startDate: string, daysToAdd: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(y, m - 1, d + daysToAdd);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}


// Pick N breakfasts + N lunches + N dinners per city (N = days in that city)
function autoPickFood(food: FoodSuggestion[], cityDays: Record<string, number>): FoodSuggestion[] {
  const cities = [...new Set(food.map((f) => f.city))];
  const picked: FoodSuggestion[] = [];
  for (const city of cities) {
    const n = cityDays[city] ?? 1;
    const cityFood = food.filter((f) => f.city === city);
    const byType = (t: string) => cityFood.filter((f) => f.meal_type === t).slice(0, n);
    picked.push(...byType("breakfast"));
    picked.push(...byType("lunch"));
    picked.push(...byType("dinner"));
    picked.push(...byType("snack").slice(0, 1)); // max 1 snack per city
  }
  return picked;
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, itinerary_id, selected_food_ids, food_suggestions, ai_pick, city_days } = await req.json() as {
      user_id: string;
      itinerary_id: string;
      selected_food_ids?: string[];
      food_suggestions: FoodSuggestion[];
      ai_pick?: boolean;
      /** Map of city name → number of days spent there */
      city_days?: Record<string, number>;
    };

    if (!user_id || !itinerary_id || !food_suggestions?.length) {
      return NextResponse.json({ error: "user_id, itinerary_id, and food_suggestions are required" }, { status: 400 });
    }

    const toAdd: FoodSuggestion[] = ai_pick
      ? autoPickFood(food_suggestions, city_days ?? {})
      : food_suggestions.filter((f) => selected_food_ids?.includes(f.id));

    if (!toAdd.length) {
      return NextResponse.json({ error: "No food items selected" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch itinerary to get start_date, end_date, and destination for timezone
    const { data: itinerary } = await supabase
      .from("itineraries")
      .select("start_date, end_date, destination, timezone")
      .eq("id", itinerary_id)
      .single();

    const startDate = itinerary?.start_date ?? new Date().toISOString().split("T")[0];
    // Use stored IANA timezone if available; otherwise geo-lookup from first food suggestion's coords
    let ianaTimezone = (itinerary?.timezone as string | null) ?? "";
    if (!ianaTimezone || ianaTimezone === "UTC") {
      const firstFood = toAdd[0];
      if (firstFood?.location?.lat && firstFood?.location?.lng) {
        const zones = geoFind(firstFood.location.lat, firstFood.location.lng);
        if (zones.length > 0) ianaTimezone = zones[0];
      }
    }
    if (!ianaTimezone) ianaTimezone = "UTC";
    const tzOffset = ianaToOffset(ianaTimezone);

    // Count how many of each meal_type we've seen, to assign each to a different day
    const typeCount: Record<string, number> = {};

    // Convert FoodSuggestion → itinerary_nodes row with proper scheduled times
    const now = new Date().toISOString();
    const mealNodes = toAdd.map((f) => {
      const slot = MEAL_SLOTS[f.meal_type] ?? MEAL_SLOTS.snack;
      const dayIdx = typeCount[f.meal_type] ?? 0;
      typeCount[f.meal_type] = dayIdx + 1;
      const dateStr = addDays(startDate, dayIdx);
      return {
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
        start_time: `${dateStr}T${slot.start}:00${tzOffset}`,
        end_time: `${dateStr}T${slot.end}:00${tzOffset}`,
        duration_minutes: slot.durationMin,
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
      };
    });

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
