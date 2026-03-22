import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findFoodPlaces, buildUserContextFromRaw } from "@/lib/langgraph/planner";
import { getAllMemories } from "@/lib/supabase/memory";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { user_id, cities, date_range, city_days } = await req.json() as {
      user_id: string;
      cities: string[];
      // Dashboard sends { from, to }; normalise to { start, end } for findFoodPlaces
      date_range: { from?: string; to?: string; start?: string; end?: string };
      city_days?: Record<string, number>;
    };

    if (!user_id || !cities?.length) {
      return NextResponse.json({ error: "user_id and cities are required" }, { status: 400 });
    }

    // Normalise date_range keys (dashboard sends from/to, type says start/end)
    const normDateRange = {
      start: date_range?.start ?? date_range?.from ?? "",
      end: date_range?.end ?? date_range?.to ?? "",
    };

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

    // Call findFoodPlaces once per city in parallel so each city gets its own
    // Gemini response budget — a single multi-city call often gets truncated after
    // the first city when Google Search grounding is active.
    logger.info("Food", `Finding food for cities: ${cities.join(", ")} (parallel per-city)`);
    const perCityResults = await Promise.all(
      cities.map(async (city) => {
        const result = await findFoodPlaces(
          [city],
          normDateRange,
          userContext,
          { [city]: city_days?.[city] ?? 1 }
        );
        // Hard guard: drop any item where Gemini hallucinated the wrong city.
        // Normalise both sides to lowercase for a tolerant match.
        const cityLower = city.toLowerCase();
        const valid = result.food.filter((f) => f.city?.toLowerCase() === cityLower);
        const dropped = result.food.length - valid.length;
        if (dropped > 0) {
          logger.warn("Food", `Dropped ${dropped} items for ${city} — city field mismatch (Gemini hallucination)`);
        }
        return { food: valid };
      })
    );
    const food = perCityResults.flatMap((r) => r.food);

    logger.success("Food", `Total food suggestions: ${food.length} across ${cities.length} cities`);
    return NextResponse.json({ food });
  } catch (error) {
    logger.error("Food", "Unexpected error", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
