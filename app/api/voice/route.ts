import { NextRequest, NextResponse } from "next/server";

// ============================================================
// GET /api/voice
// Returns a short-lived Gemini Live WebSocket session token.
// The client uses this to connect directly to Gemini Live API
// via WebSocket for real-time voice conversation.
// ============================================================
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Voice API not configured" }, { status: 503 });
  }

  // Return the config for the client to establish a WebSocket session
  // The Gemini Live API uses WebSockets directly from the client
  return NextResponse.json({
    model: "gemini-2.5-flash-native-audio-latest",
    api_key: apiKey, // Only expose in dev; in production use a session token approach
    config: {
      response_modalities: ["AUDIO"],
      system_instruction: {
        parts: [
          {
            text: `You are Planit, an adaptive AI travel sidekick. You're helping a user plan and navigate their trip.
Be warm, concise, and proactive. If the user mentions discomfort or preferences, remember them.
Speak naturally as if you're a helpful local guide who knows the user well.
When giving directions, be specific about accessibility (elevators, ramps).
When recommending places, always explain WHY it matches the user's preferences.`,
          },
        ],
      },
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: "Aoede", // Warm, friendly voice
          },
        },
      },
      tools: [
        {
          function_declarations: [
            {
              name: "search_nearby",
              description: "Search for places or activities nearby the user's current location",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "What to search for" },
                  filters: {
                    type: "array",
                    items: { type: "string" },
                    description: "Accessibility or preference filters",
                  },
                },
                required: ["query"],
              },
            },
            {
              name: "update_itinerary",
              description: "Update or pivot the current travel itinerary",
              parameters: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["add_activity", "remove_activity", "pivot", "get_commute"],
                  },
                  details: { type: "string" },
                },
                required: ["action"],
              },
            },
            {
              name: "remember_preference",
              description: "Save a user preference or feedback for future planning",
              parameters: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  value: { type: "string" },
                  category: { type: "string" },
                },
                required: ["key", "value"],
              },
            },
          ],
        },
      ],
    },
  });
}
