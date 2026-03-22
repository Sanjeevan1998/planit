import { NextRequest, NextResponse } from "next/server";
import { findInterCityTransport } from "@/lib/langgraph/planner";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { from_city, to_city, travel_date } = await req.json() as {
      from_city: string;
      to_city: string;
      travel_date: string;
    };

    if (!from_city || !to_city || !travel_date) {
      return NextResponse.json({ error: "from_city, to_city, and travel_date are required" }, { status: 400 });
    }

    logger.info("Transport", `Finding transport from ${from_city} to ${to_city} on ${travel_date}`);
    const result = await findInterCityTransport(from_city, to_city, travel_date);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Transport", "Unexpected error", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
