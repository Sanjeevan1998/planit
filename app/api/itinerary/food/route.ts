import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findFoodPlaces, buildUserContextFromRaw } from "@/lib/langgraph/planner";
import { getAllMemories } from "@/lib/supabase/memory";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { user_id, cities, date_range } = await req.json() as {
      user_id: string;
      cities: string[];
      date_range: { start: string; end: string };
    };

    if (!user_id || !cities?.length) {
      return NextResponse.json({ error: "user_id and cities are required" }, { status: 400 });
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

    logger.info("Food", `Finding food for cities: ${cities.join(", ")}`);
    const { food } = await findFoodPlaces(cities, date_range, userContext);

    return NextResponse.json({ food });
  } catch (error) {
    logger.error("Food", "Unexpected error", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
