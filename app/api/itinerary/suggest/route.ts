import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { suggestActivities, buildUserContextFromRaw } from "@/lib/langgraph/planner";
import { getAllMemories } from "@/lib/supabase/memory";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { message, user_id } = await req.json();
    if (!message || !user_id) {
      return NextResponse.json({ error: "message and user_id are required" }, { status: 400 });
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

    logger.info("Suggest", `Suggesting activities for: "${message}"`);
    const { suggestions, response } = await suggestActivities(message, userContext);

    if (!suggestions) {
      return NextResponse.json({ error: response }, { status: 500 });
    }

    return NextResponse.json({ response, trip_suggestions: suggestions });
  } catch (error) {
    logger.error("Suggest", "Unexpected error", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
