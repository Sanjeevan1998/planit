import { describe, it, expect } from "vitest";
import {
  buildSetupMessage,
  buildAudioChunk,
  buildToolResponse,
  buildSystemPrompt,
} from "../hooks/useGeminiLive";
import type { UserMemory } from "../types";

// ── buildSetupMessage ─────────────────────────────────────────

describe("buildSetupMessage", () => {
  const tools = [{ function_declarations: [] }];

  it("wraps everything under a 'setup' key", () => {
    const msg = buildSetupMessage("gemini-2.5-flash", "You are a guide.", tools);
    expect(msg).toHaveProperty("setup");
  });

  it("prefixes model name with 'models/'", () => {
    const msg = buildSetupMessage("gemini-2.5-flash", "sys", tools);
    expect(msg.setup.model).toBe("models/gemini-2.5-flash");
  });

  it("includes AUDIO in response_modalities (native audio model only supports AUDIO)", () => {
    const msg = buildSetupMessage("m", "sys", tools);
    const modalities = msg.setup.generation_config.response_modalities;
    expect(modalities).toContain("AUDIO");
    expect(modalities).not.toContain("TEXT");
  });

  it("sets voice to Aoede", () => {
    const msg = buildSetupMessage("m", "sys", tools);
    const voiceName =
      msg.setup.generation_config.speech_config.voice_config.prebuilt_voice_config.voice_name;
    expect(voiceName).toBe("Aoede");
  });

  it("injects the system instruction text correctly", () => {
    const sysText = "You are a travel agent.";
    const msg = buildSetupMessage("m", sysText, tools);
    expect(msg.setup.system_instruction.parts[0].text).toBe(sysText);
  });

  it("passes tools through unchanged", () => {
    const customTools = [{ function_declarations: [{ name: "foo" }] }];
    const msg = buildSetupMessage("m", "sys", customTools);
    expect(msg.setup.tools).toStrictEqual(customTools);
  });
});

// ── buildAudioChunk ───────────────────────────────────────────

describe("buildAudioChunk", () => {
  it("wraps base64 under realtime_input.media_chunks", () => {
    const msg = buildAudioChunk("abc123==");
    expect(msg.realtime_input.media_chunks[0].data).toBe("abc123==");
  });

  it("sets mime_type to audio/pcm;rate=16000", () => {
    const msg = buildAudioChunk("abc");
    expect(msg.realtime_input.media_chunks[0].mime_type).toBe("audio/pcm;rate=16000");
  });

  it("produces exactly one media chunk per call", () => {
    const msg = buildAudioChunk("data");
    expect(msg.realtime_input.media_chunks).toHaveLength(1);
  });
});

// ── buildToolResponse ─────────────────────────────────────────

describe("buildToolResponse", () => {
  it("wraps response under tool_response.function_responses", () => {
    const msg = buildToolResponse("call-1", { result: "ok" });
    expect(msg.tool_response.function_responses).toHaveLength(1);
  });

  it("echoes back the function call id", () => {
    const msg = buildToolResponse("call-42", { success: true });
    expect(msg.tool_response.function_responses[0].id).toBe("call-42");
  });

  it("nests output under response.output", () => {
    const output = { success: true, message: "done" };
    const msg = buildToolResponse("id", output);
    expect(msg.tool_response.function_responses[0].response.output).toStrictEqual(output);
  });

  it("handles complex nested output objects", () => {
    const output = { itinerary: { title: "Tokyo trip", nodes: [{ id: "1" }] } };
    const msg = buildToolResponse("id", output);
    // @ts-expect-error — dynamic shape
    expect(msg.tool_response.function_responses[0].response.output.itinerary.title).toBe(
      "Tokyo trip"
    );
  });
});

// ── buildSystemPrompt ─────────────────────────────────────────

const SAMPLE_MEMORIES: UserMemory[] = [
  {
    id: "m1",
    user_id: "u1",
    category: "likes",
    key: "food_preference",
    value: "vegan",
    source: "voice",
    confidence: 0.95,
    created_at: "",
    updated_at: "",
  },
  {
    id: "m2",
    user_id: "u1",
    category: "accessibility",
    key: "mobility",
    value: "uses wheelchair",
    source: "text",
    confidence: 1.0,
    created_at: "",
    updated_at: "",
  },
];

describe("buildSystemPrompt", () => {
  it("includes user memories in the prompt", () => {
    const prompt = buildSystemPrompt(SAMPLE_MEMORIES, null);
    expect(prompt).toContain("vegan");
    expect(prompt).toContain("uses wheelchair");
  });

  it("formats memory as category: key: value", () => {
    const prompt = buildSystemPrompt(SAMPLE_MEMORIES, null);
    expect(prompt).toContain("[likes] food_preference: vegan");
    expect(prompt).toContain("[accessibility] mobility: uses wheelchair");
  });

  it("indicates no itinerary when null is passed", () => {
    const prompt = buildSystemPrompt([], null);
    expect(prompt).toContain("No active itinerary yet");
  });

  it("injects itinerary JSON when provided", () => {
    const itinerary = {
      id: "it1",
      user_id: "u1",
      title: "Tokyo Trip",
      destination: "Tokyo",
      status: "active",
      budget: "mid-range",
      nodes: [],
      created_at: "",
      updated_at: "",
    };
    // @ts-expect-error — partial itinerary for test
    const prompt = buildSystemPrompt([], itinerary);
    expect(prompt).toContain("Tokyo Trip");
    expect(prompt).toContain('"destination": "Tokyo"');
  });

  it("mentions all five tool names so the model knows what it can do", () => {
    const prompt = buildSystemPrompt([], null);
    expect(prompt).toContain("remember_preference");
    expect(prompt).toContain("update_itinerary");
    expect(prompt).toContain("search_nearby");
    expect(prompt).toContain("get_memories");
    expect(prompt).toContain("advance_planning_flow");
  });

  it("injects trip suggestions when provided", () => {
    const suggestions = {
      trip_title: "Tokyo Adventure",
      destination: "Tokyo",
      start_date: "2026-04-01",
      end_date: "2026-04-07",
      cities: [
        {
          city: "Tokyo",
          activities: [
            { id: "act-1", title: "Shibuya Crossing Walk", description: "Iconic crossing" },
          ],
        },
      ],
    };
    // @ts-expect-error — partial TripSuggestions for test
    const prompt = buildSystemPrompt([], null, suggestions);
    expect(prompt).toContain("Tokyo Adventure");
    expect(prompt).toContain("act-1");
    expect(prompt).toContain("Shibuya Crossing Walk");
    expect(prompt).toContain("PICKING");
  });

  it("says 'No preferences stored yet' when memories array is empty", () => {
    const prompt = buildSystemPrompt([], null);
    expect(prompt).toContain("No preferences stored yet");
  });

  it("is a string", () => {
    expect(typeof buildSystemPrompt([], null)).toBe("string");
  });

  it("is non-empty for all input combinations", () => {
    expect(buildSystemPrompt([], null).length).toBeGreaterThan(100);
    expect(buildSystemPrompt(SAMPLE_MEMORIES, null).length).toBeGreaterThan(100);
  });
});

// ── WebSocket message wire format sanity checks ───────────────

describe("Gemini Live wire format", () => {
  it("buildSetupMessage is JSON-serialisable", () => {
    const msg = buildSetupMessage("m", "sys", []);
    expect(() => JSON.stringify(msg)).not.toThrow();
  });

  it("buildAudioChunk is JSON-serialisable", () => {
    expect(() => JSON.stringify(buildAudioChunk("abc"))).not.toThrow();
  });

  it("buildToolResponse is JSON-serialisable", () => {
    expect(() => JSON.stringify(buildToolResponse("id", { ok: true }))).not.toThrow();
  });

  it("setup message JSON does not contain undefined values", () => {
    const json = JSON.stringify(buildSetupMessage("model", "sys", []));
    expect(json).not.toContain("undefined");
  });

  it("audio chunk JSON is small (no unnecessary keys)", () => {
    const json = JSON.stringify(buildAudioChunk("data"));
    const parsed = JSON.parse(json);
    // Only realtime_input key at root
    expect(Object.keys(parsed)).toEqual(["realtime_input"]);
  });
});
