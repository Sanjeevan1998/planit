import { NextRequest, NextResponse } from "next/server";
import { find as geoFind } from "geo-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { ianaToOffset } from "@/lib/langgraph/planner";
import { logger } from "@/lib/logger";
import { addDays, autoPickFood } from "@/lib/utils/itinerary-helpers";
import type { FoodSuggestion } from "@/types";

const VALID_BUDGET_TIERS = new Set(["budget", "mid-range", "premium", "luxury"]);

// Meal time slots: start/end in HH:MM
const MEAL_SLOTS: Record<string, { start: string; end: string; durationMin: number }> = {
  breakfast: { start: "07:30", end: "08:30", durationMin: 60 },
  lunch:     { start: "12:00", end: "13:30", durationMin: 90 },
  dinner:    { start: "18:30", end: "20:00", durationMin: 90 },
  snack:     { start: "15:00", end: "15:30", durationMin: 30 },
};

export async function POST(req: NextRequest) {
  try {
    const { user_id, itinerary_id, selected_food_ids, food_suggestions, ai_pick, city_date_ranges } = await req.json() as {
      user_id: string;
      itinerary_id: string;
      selected_food_ids?: string[];
      food_suggestions: FoodSuggestion[];
      ai_pick?: boolean;
      /** Map of city name → date range */
      city_date_ranges?: Record<string, { from: string; to: string }>;
    };

    if (!user_id || !itinerary_id || !food_suggestions?.length) {
      return NextResponse.json({ error: "user_id, itinerary_id, and food_suggestions are required" }, { status: 400 });
    }

    // Build city_days from city_date_ranges for autoPickFood
    const cityDaysFromRanges: Record<string, number> = {};
    if (city_date_ranges) {
      for (const [city, range] of Object.entries(city_date_ranges)) {
        const from = new Date(range.from + "T00:00:00").getTime();
        const to = new Date(range.to + "T00:00:00").getTime();
        cityDaysFromRanges[city] = Math.max(1, Math.round((to - from) / 86400000) + 1);
      }
    }
    const toAdd: FoodSuggestion[] = ai_pick
      ? autoPickFood(food_suggestions, cityDaysFromRanges)
      : food_suggestions.filter((f) => selected_food_ids?.includes(f.id));

    if (!toAdd.length) {
      return NextResponse.json({ error: "No food items selected" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch itinerary + existing nodes to detect time conflicts
    const { data: itinerary } = await supabase
      .from("itineraries")
      .select("start_date, end_date, destination, timezone")
      .eq("id", itinerary_id)
      .single();

    const { data: existingNodes } = await supabase
      .from("itinerary_nodes")
      .select("start_time, end_time, type")
      .eq("itinerary_id", itinerary_id)
      .neq("type", "transport");

    // Convert "HH:MM" to minutes since midnight
    function toMins(t: string) {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    }

    // The time window each meal type "owns" on a given day (anything overlapping = conflict)
    const MEAL_WINDOWS: Record<string, { from: number; to: number }> = {
      breakfast: { from: toMins("06:00"), to: toMins("10:30") },
      lunch:     { from: toMins("11:00"), to: toMins("14:30") },
      dinner:    { from: toMins("17:00"), to: toMins("21:30") },
      snack:     { from: toMins("13:30"), to: toMins("16:30") },
    };

    // Returns true if the given date already has a node occupying the meal window
    function isSlotOccupied(dateStr: string, mealType: string): boolean {
      const window = MEAL_WINDOWS[mealType];
      if (!window) return false;
      return (existingNodes ?? []).some((n) => {
        if (!n.start_time) return false;
        const nodeDate = n.start_time.split("T")[0];
        if (nodeDate !== dateStr) return false;
        const nodeStartRaw = n.start_time.split("T")[1]?.substring(0, 5);
        const nodeEndRaw = n.end_time?.split("T")[1]?.substring(0, 5);
        if (!nodeStartRaw) return false;
        const nodeStart = toMins(nodeStartRaw);
        const nodeEnd = nodeEndRaw ? toMins(nodeEndRaw) : nodeStart + 60;
        return nodeStart < window.to && nodeEnd > window.from;
      });
    }

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

    // Per-city day counters and start dates
    const cityTypeCount: Record<string, Record<string, number>> = {};
    const cityStartDates: Record<string, string> = {};
    if (city_date_ranges) {
      for (const [city, range] of Object.entries(city_date_ranges)) {
        cityStartDates[city] = range.from;
      }
    }

    // Max days per city (to avoid infinite loop)
    const cityMaxDays: Record<string, number> = {};
    if (city_date_ranges) {
      for (const [city, range] of Object.entries(city_date_ranges)) {
        const from = new Date(range.from + "T00:00:00").getTime();
        const to = new Date(range.to + "T00:00:00").getTime();
        cityMaxDays[city] = Math.max(1, Math.round((to - from) / 86400000) + 1);
      }
    }

    const now = new Date().toISOString();
    const mealNodes: ReturnType<typeof Object.assign>[] = [];
    for (const f of toAdd) {
      const slot = MEAL_SLOTS[f.meal_type] ?? MEAL_SLOTS.snack;
      const cityKey = f.city ?? "default";
      if (!cityTypeCount[cityKey]) cityTypeCount[cityKey] = {};
      let dayIdx = cityTypeCount[cityKey][f.meal_type] ?? 0;
      const baseDate = cityStartDates[cityKey] ?? startDate;
      const maxDays = cityMaxDays[cityKey] ?? 14;

      // Advance dayIdx until we find a day where this meal slot is free
      let dateStr = addDays(baseDate, dayIdx);
      while (dayIdx < maxDays && isSlotOccupied(dateStr, f.meal_type)) {
        dayIdx++;
        dateStr = addDays(baseDate, dayIdx);
      }

      // Guard: if no free slot exists within this city's date range, skip the
      // meal rather than letting it overflow into the next city's days.
      if (dayIdx >= maxDays) {
        logger.warn("AddFood", `No free ${f.meal_type} slot for "${f.title}" in ${cityKey} — skipping`);
        continue;
      }

      cityTypeCount[cityKey][f.meal_type] = dayIdx + 1;
      mealNodes.push({
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
      });
    }

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
