"use client";

// ============================================================
// useGeminiLive — Gemini Multimodal Live API WebSocket hook
//
// What it does:
//  1. Fetches the user's stored memories from /api/memory
//  2. Injects memories + active itinerary into the system prompt
//  3. Opens a WebSocket to the Gemini Live BidiGenerateContent API
//  4. Streams raw 16 kHz PCM from the microphone to the API
//  5. Plays back 24 kHz PCM audio from the model
//  6. Intercepts functionCall messages and routes them to the
//     existing backend (chat, memory, itinerary API routes)
//  7. Sends tool_response back so the model can verbally confirm
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { PCMAudioCapture, PCMAudioPlayer } from "@/lib/audio-utils";
import { usePlanitStore } from "@/store/planit";
import type { Itinerary, UserMemory, TripSuggestions } from "@/types";

// ── Types ───────────────────────────────────────────────────

export type ConnectionState = "idle" | "connecting" | "connected" | "error";
export type VoiceState = "listening" | "thinking" | "speaking";

export interface TranscriptMessage {
  role: "user" | "model";
  text: string;
}

export interface UseGeminiLiveOptions {
  userId: string;
  itinerary: Itinerary | null;
  tripSuggestions: TripSuggestions | null;
  onTranscript?: (msg: TranscriptMessage) => void;
  onItineraryUpdate?: (itinerary: Itinerary) => void;
}

export interface UseGeminiLiveReturn {
  connectionState: ConnectionState;
  voiceState: VoiceState | null;
  transcript: TranscriptMessage[];
  audioLevel: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  interrupt: () => void;
}

// ── Gemini message builders (exported for unit tests) ────────

export function buildSetupMessage(
  model: string,
  systemText: string,
  tools: unknown[]
) {
  return {
    setup: {
      model: `models/${model}`,
      generation_config: {
        // Native audio model only supports AUDIO output modality.
        // Transcripts come via outputTranscription, not a TEXT part.
        response_modalities: ["AUDIO"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: { voice_name: "Aoede" },
          },
        },
      },
      system_instruction: {
        parts: [{ text: systemText }],
      },
      tools,
    },
  };
}

export function buildAudioChunk(base64: string) {
  return {
    realtime_input: {
      media_chunks: [{ data: base64, mime_type: "audio/pcm;rate=16000" }],
    },
  };
}

export function buildToolResponse(
  id: string,
  output: unknown
) {
  return {
    tool_response: {
      function_responses: [{ id, response: { output } }],
    },
  };
}

// ── Memory formatter ─────────────────────────────────────────

function formatMemories(memories: UserMemory[]): string {
  if (!memories.length) return "No preferences stored yet.";
  return memories
    .map((m) => `• [${m.category}] ${m.key}: ${m.value}`)
    .join("\n");
}

// ── System prompt builder ────────────────────────────────────

export function buildSystemPrompt(
  memories: UserMemory[],
  itinerary: Itinerary | null,
  tripSuggestions?: TripSuggestions | null
): string {
  const memoryBlock = formatMemories(memories);
  const itineraryBlock = itinerary
    ? JSON.stringify(itinerary, null, 2)
    : "No active itinerary yet.";

  let suggestionsBlock = "";
  if (tripSuggestions) {
    const activitiesList = tripSuggestions.cities
      .flatMap((city) =>
        city.activities.map(
          (a) => `  • [${a.id}] ${a.title} (${city.city}) — ${a.description ?? ""}`
        )
      )
      .join("\n");
    suggestionsBlock = `
## Activity suggestions available for the user to pick from
Trip: ${tripSuggestions.trip_title} (${tripSuggestions.start_date} → ${tripSuggestions.end_date})
${activitiesList}

The user is in the PICKING phase. Walk them through the activities, ask what they like,
and when they are ready call advance_planning_flow with the appropriate action.
`;
  }

  return `You are Planit, an expert AI travel sidekick and personal assistant.

## Your personality
Be warm, concise, and proactive. Speak naturally as if you are a knowledgeable local
guide who knows the user personally. Never be robotic.

## What you know about this user
The following preferences and facts have been learned from past interactions:

${memoryBlock}

## Their current itinerary
${itineraryBlock}
${suggestionsBlock}
## Your capabilities
Use the tools available to you to:
- **remember_preference**: When the user mentions a preference, allergy, or any personal
  detail, ALWAYS save it immediately using this tool so you remember it next time.
- **update_itinerary**: When the user wants to add, remove, or change activities, use this
  tool. Ask one clarifying question if the request is ambiguous before calling it.
- **search_nearby**: When the user wants to find something near them (restaurants, transport,
  attractions), use this tool.
- **get_memories**: Look up a specific stored preference or past interaction when relevant.
- **advance_planning_flow**: Move the trip-planning UI to the next phase. Use this when:
  - The user says "build my trip", "looks good", "go ahead", "select all" → action: build_all_activities
  - The user says "build with what I picked", "use my selection" → action: build_selected_activities
  - The user says "add food", "yes to food", "let AI pick food" → action: add_food_ai
  - The user says "skip food", "no food", "just activities" → action: skip_food

## Rules
- **Start every new session** by greeting the user warmly and asking their name (e.g. "Hi! I'm Planit, your travel sidekick. What's your name?"). Do this immediately — do not wait for the user to speak first.
- If the user mentions discomfort, constraints, or preferences, proactively save them with remember_preference.
- Before modifying the itinerary, briefly confirm what you understood, then do it.
- Always reference stored preferences when making recommendations (explain WHY).
- Keep responses concise — this is a voice interface, not a text chat.
- Never ask more than one question at a time.`;
}

// ── Hook ─────────────────────────────────────────────────────

export function useGeminiLive({
  userId,
  itinerary,
  tripSuggestions,
  onTranscript,
  onItineraryUpdate,
}: UseGeminiLiveOptions): UseGeminiLiveReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [voiceState, setVoiceState] = useState<VoiceState | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<PCMAudioCapture | null>(null);
  const playerRef = useRef<PCMAudioPlayer | null>(null);
  const animFrameRef = useRef<number>(0);

  // ── Cleanup ────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    captureRef.current?.stop();
    captureRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setConnectionState("idle");
    setVoiceState(null);
    setAudioLevel(0);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  // ── Barge-in / interrupt ───────────────────────────────────

  const interrupt = useCallback(() => {
    playerRef.current?.clear();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ client_content: { turns: [], turn_complete: true } })
      );
    }
  }, []);

  // ── Tool call handler ──────────────────────────────────────

  const handleToolCalls = useCallback(
    async (
      functionCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
    ) => {
      setVoiceState("thinking");

      const responses = await Promise.all(
        functionCalls.map(async (fc) => {
          let output: unknown;

          switch (fc.name) {
            // ── update_itinerary ─────────────────────────────
            // Routes through /api/chat which drives the full
            // LangGraph planner — existing backend untouched.
            case "update_itinerary": {
              try {
                const res = await fetch("/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    message: fc.args.details
                      ? `${fc.args.action}: ${fc.args.details}`
                      : `Perform action: ${fc.args.action}`,
                    user_id: userId,
                    voice: true,
                  }),
                });
                const data = await res.json();
                // Dispatch the full ChatResponse to the dashboard so it drives
                // phase transitions exactly as text input would.
                usePlanitStore.getState().dispatchChatResponse(data);
                output = {
                  success: true,
                  message: data.message ?? "Itinerary updated successfully.",
                  itinerary_summary: data.itinerary
                    ? `${data.itinerary.title} — ${data.itinerary.nodes?.length ?? 0} activities`
                    : null,
                };
              } catch {
                output = { success: false, error: "Failed to update itinerary." };
              }
              break;
            }

            // ── remember_preference ──────────────────────────
            // Persists a user preference to Supabase via /api/memory.
            // Feeds back into future system prompts on next connect.
            case "remember_preference": {
              try {
                await fetch("/api/memory", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    user_id: userId,
                    memories: [
                      {
                        key: fc.args.key,
                        value: fc.args.value,
                        category: fc.args.category ?? "likes",
                        source: "voice",
                        confidence: 0.9,
                      },
                    ],
                  }),
                });
                output = {
                  success: true,
                  message: `Remembered: ${fc.args.key} = ${fc.args.value}`,
                };
              } catch {
                output = { success: false, error: "Failed to save preference." };
              }
              break;
            }

            // ── get_memories ─────────────────────────────────
            // Lets the AI look up the user's stored preferences
            // for a specific category or query.
            case "get_memories": {
              try {
                const params = new URLSearchParams({ user_id: userId });
                if (fc.args.category) params.set("category", fc.args.category as string);
                if (fc.args.query) params.set("q", fc.args.query as string);
                const res = await fetch(`/api/memory?${params}`);
                const data = await res.json();
                output = {
                  memories: data.memories ?? [],
                  formatted: formatMemories(data.memories ?? []),
                };
              } catch {
                output = { memories: [], formatted: "Could not retrieve memories." };
              }
              break;
            }

            // ── search_nearby ─────────────────────────────────
            // Triggers the existing /api/chat with a search intent.
            case "search_nearby": {
              try {
                const res = await fetch("/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    message: `Find nearby: ${fc.args.query}${
                      fc.args.filters ? ` (filters: ${(fc.args.filters as string[]).join(", ")})` : ""
                    }`,
                    user_id: userId,
                    voice: true,
                  }),
                });
                const data = await res.json();
                output = { success: true, results: data.message ?? "Search complete." };
              } catch {
                output = { success: false, error: "Search failed." };
              }
              break;
            }

            // ── advance_planning_flow ─────────────────────────
            // Tells the dashboard to move to the next planning phase.
            // The actual state transition is executed by the dashboard's
            // useEffect that watches pendingVoiceAction.
            case "advance_planning_flow": {
              const action = fc.args.action as string;
              const validActions = [
                "build_all_activities",
                "build_selected_activities",
                "add_food_ai",
                "skip_food",
              ];
              if (validActions.includes(action)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                usePlanitStore.getState().dispatchVoiceAction({ type: action } as any);
                output = { success: true, message: `Advancing planning flow: ${action}` };
              } else {
                output = { success: false, error: `Unknown action: ${action}` };
              }
              break;
            }

            default:
              output = { error: `Unknown tool: ${fc.name}` };
          }

          return buildToolResponse(fc.id, output);
        })
      );

      // Send all tool responses back in one message.
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Merge all function_responses into a single tool_response message.
        const functionResponses = responses.flatMap(
          (r) => (r.tool_response as { function_responses: unknown[] }).function_responses
        );
        wsRef.current.send(
          JSON.stringify({ tool_response: { function_responses: functionResponses } })
        );
      }
    },
    [userId]
  );

  // ── Transcript helpers ─────────────────────────────────────

  const addTranscript = useCallback(
    (role: "user" | "model", text: string) => {
      const msg: TranscriptMessage = { role, text };
      setTranscript((prev) => {
        // Merge consecutive messages from the same role (streaming chunks).
        const last = prev[prev.length - 1];
        if (last?.role === role) {
          return [...prev.slice(0, -1), { role, text: last.text + " " + text }];
        }
        return [...prev, msg];
      });
      onTranscript?.(msg);
    },
    [onTranscript]
  );

  // ── connect ───────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (connectionState !== "idle") return;
    setConnectionState("connecting");
    setTranscript([]);

    try {
      // 1. Fetch API config (key + model name) from our backend.
      const configRes = await fetch(`/api/voice?user_id=${userId}`);
      const config = await configRes.json();

      // 2. Fetch the user's stored memories to inject into system prompt.
      const memoryRes = await fetch(`/api/memory?user_id=${userId}`);
      const memoryData = await memoryRes.json();
      const memories: UserMemory[] = memoryData.memories ?? [];

      // 3. Build the context-aware system prompt.
      const systemText = buildSystemPrompt(memories, itinerary, tripSuggestions);

      // 4. Define tools (keep in sync with /api/voice declarations).
      const tools = [
        {
          function_declarations: [
            {
              name: "update_itinerary",
              description:
                "Add, remove, or modify activities in the user's current travel itinerary.",
              parameters: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["add_activity", "remove_activity", "pivot", "get_commute"],
                    description: "The modification action to perform.",
                  },
                  details: {
                    type: "string",
                    description:
                      "Natural language description of what to change, e.g. 'Add a sushi dinner at 7pm'.",
                  },
                },
                required: ["action"],
              },
            },
            {
              name: "remember_preference",
              description:
                "Save a user preference, allergy, accessibility need, or personal detail for future use.",
              parameters: {
                type: "object",
                properties: {
                  key: { type: "string", description: "Short label, e.g. 'dietary_restriction'" },
                  value: { type: "string", description: "The value, e.g. 'vegan'" },
                  category: {
                    type: "string",
                    description: "Memory category: likes, dislikes, allergies, accessibility, budget, vibe, transport, activity, accommodation",
                  },
                },
                required: ["key", "value"],
              },
            },
            {
              name: "get_memories",
              description:
                "Look up previously stored preferences or facts about the user. Use when making personalised recommendations.",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    description: "Filter by category (optional).",
                  },
                  query: {
                    type: "string",
                    description: "Semantic search query (optional).",
                  },
                },
              },
            },
            {
              name: "search_nearby",
              description:
                "Search for nearby restaurants, activities, or places of interest.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "What to search for." },
                  filters: {
                    type: "array",
                    items: { type: "string" },
                    description: "Accessibility or preference filters.",
                  },
                },
                required: ["query"],
              },
            },
            {
              name: "advance_planning_flow",
              description:
                "Advance the trip-planning UI to the next phase. Call this when the user is ready to move forward — e.g. they confirm activity selection, want to build their trip, or decide about food.",
              parameters: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: [
                      "build_all_activities",
                      "build_selected_activities",
                      "add_food_ai",
                      "skip_food",
                    ],
                    description:
                      "build_all_activities: select everything and build; build_selected_activities: build with current selection; add_food_ai: let AI add food; skip_food: skip food step.",
                  },
                },
                required: ["action"],
              },
            },
          ],
        },
      ];

      // 5. Open WebSocket.
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.api_key}`;
      const ws = new WebSocket(wsUrl);
      // Gemini Live sends ALL responses as binary frames — request ArrayBuffer
      // so we can decode them with TextDecoder instead of getting a Blob.
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify(buildSetupMessage(config.model, systemText, tools)));
      };

      ws.onmessage = async (event) => {
        try {
          // Gemini Live sends JSON as binary (ArrayBuffer) frames, not text.
          let jsonText: string;
          if (typeof event.data === "string") {
            jsonText = event.data;
          } else if (event.data instanceof ArrayBuffer) {
            jsonText = new TextDecoder().decode(event.data);
          } else {
            return; // unexpected type
          }
          const msg = JSON.parse(jsonText);

          // ── Setup complete → start microphone ──────────────
          if (msg.setupComplete) {
            const player = new PCMAudioPlayer();
            playerRef.current = player;

            const capture = new PCMAudioCapture((base64) => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify(buildAudioChunk(base64)));
              }
            });
            captureRef.current = capture;
            await capture.start();

            // Audio level loop for orb animation.
            const analyser = capture.getAnalyser();
            if (analyser) {
              const data = new Uint8Array(analyser.frequencyBinCount);
              const tick = () => {
                analyser.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                setAudioLevel(avg / 128);
                animFrameRef.current = requestAnimationFrame(tick);
              };
              tick();
            }

            setConnectionState("connected");
            setVoiceState("thinking");

            // Trigger the model to speak first — it should greet the user
            // and ask for their name per the system prompt instructions.
            ws.send(
              JSON.stringify({
                client_content: {
                  turns: [{ role: "user", parts: [{ text: "Hello" }] }],
                  turn_complete: true,
                },
              })
            );
          }

          // ── User speech transcription ─────────────────────
          const inputText = msg.serverContent?.inputTranscription?.text;
          if (inputText) addTranscript("user", inputText);

          // ── Model turn: audio + optional text ────────────
          const parts = msg.serverContent?.modelTurn?.parts as
            | Array<{ text?: string; inlineData?: { mimeType?: string; data: string } }>
            | undefined;

          if (parts?.length) {
            setVoiceState("speaking");
            for (const part of parts) {
              if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
                playerRef.current?.enqueue(part.inlineData.data);
              }
              if (part.text) {
                addTranscript("model", part.text);
              }
            }
          }

          // ── Model speech transcription (text version of audio) ──
          const outputText = msg.serverContent?.outputTranscription?.text;
          if (outputText) addTranscript("model", outputText);

          // ── Turn complete → back to listening ─────────────
          if (msg.serverContent?.turnComplete) {
            setVoiceState("listening");
          }

          // ── Tool calls ────────────────────────────────────
          // Server sends toolCall (camelCase) per proto3 JSON mapping.
          const functionCalls = msg.toolCall?.functionCalls;
          if (Array.isArray(functionCalls) && functionCalls.length > 0) {
            await handleToolCalls(functionCalls);
          }
        } catch {
          // Binary or malformed frame — safe to ignore.
        }
      };

      ws.onerror = () => {
        setConnectionState("error");
        disconnect();
      };

      ws.onclose = () => {
        captureRef.current?.stop();
        captureRef.current = null;
        cancelAnimationFrame(animFrameRef.current);
        setConnectionState("idle");
        setVoiceState(null);
        setAudioLevel(0);
      };
    } catch (err) {
      console.error("[useGeminiLive] connection error:", err);
      setConnectionState("error");
      disconnect();
    }
  }, [connectionState, userId, itinerary, tripSuggestions, handleToolCalls, disconnect, addTranscript]);

  return {
    connectionState,
    voiceState,
    transcript,
    audioLevel,
    connect,
    disconnect,
    interrupt,
  };
}
