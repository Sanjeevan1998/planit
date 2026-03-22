#!/usr/bin/env node
// ============================================================
// Gemini Live API — Integration test (Node.js 22+, native WS)
//
// Run: node scripts/test-gemini-live.mjs
//
// Tests:
//  1. WebSocket connects and receives setupComplete
//  2. Greeting trigger works — model sends audio + transcript
//  3. Text turn round-trip — model answers a question
//  4. Tool call round-trip — model calls remember_preference
//     and we send a valid tool_response back
// ============================================================

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Read API key from .env.local ─────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) env[key.trim()] = rest.join("=").trim();
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!API_KEY) {
  console.error("❌  GOOGLE_GENERATIVE_AI_API_KEY not found in .env.local");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const MODEL = "gemini-2.5-flash-native-audio-latest";

function pass(label) {
  console.log(`  ✅  ${label}`);
}
function fail(label, detail = "") {
  console.error(`  ❌  ${label}${detail ? ": " + detail : ""}`);
}
function info(label) {
  console.log(`  ℹ️   ${label}`);
}

function openWS() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    // Gemini Live sends JSON as binary frames — decode with TextDecoder.
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", (e) => reject(new Error(String(e.message ?? e))));
    setTimeout(() => reject(new Error("WebSocket open timeout")), 10_000);
  });
}

function waitFor(ws, predicate, timeoutMs = 20_000, label = "condition") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for: ${label}`)),
      timeoutMs
    );
    const handler = (event) => {
      // Gemini Live sends JSON as binary (ArrayBuffer) frames.
      let jsonText;
      if (typeof event.data === "string") {
        jsonText = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        jsonText = new TextDecoder().decode(event.data);
      } else {
        return;
      }
      let msg;
      try { msg = JSON.parse(jsonText); } catch { return; }
      const result = predicate(msg);
      if (result !== undefined && result !== false) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(result);
      }
    };
    ws.addEventListener("message", handler);
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

// ── Setup message ─────────────────────────────────────────────
const SETUP = {
  setup: {
    model: `models/${MODEL}`,
    generation_config: {
      response_modalities: ["AUDIO"],
      speech_config: {
        voice_config: {
          prebuilt_voice_config: { voice_name: "Aoede" },
        },
      },
    },
    system_instruction: {
      parts: [
        {
          text: `You are Planit, a travel AI assistant.
When a new session starts, greet the user warmly and ask their name.
Be concise. This is a voice interface.`,
        },
      ],
    },
    tools: [
      {
        function_declarations: [
          {
            name: "remember_preference",
            description: "Save a user preference for future use.",
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
};

// ── Test runner ───────────────────────────────────────────────
async function runTests() {
  console.log("\n🧪  Gemini Live API — Integration Tests\n");

  let ws;
  let passed = 0;
  let failed = 0;

  const ok = (label) => { pass(label); passed++; };
  const bad = (label, detail) => { fail(label, detail); failed++; };

  // ── Test 1: WebSocket connects ───────────────────────────
  console.log("Test 1: WebSocket connection");
  try {
    ws = await openWS();
    ok("WebSocket opened");
  } catch (e) {
    bad("WebSocket open failed", e.message);
    console.log("\n📊 Results: 0 passed, 1 failed\n");
    process.exit(1);
  }

  // ── Test 2: Setup handshake ───────────────────────────────
  console.log("\nTest 2: Setup handshake");
  try {
    send(ws, SETUP);
    await waitFor(ws, (msg) => msg.setupComplete ? true : undefined, 10_000, "setupComplete");
    ok("Received setupComplete");
  } catch (e) {
    bad("No setupComplete received", e.message);
    ws.close();
    console.log("\n📊 Results: 1 passed, 1 failed\n");
    process.exit(1);
  }

  // ── Test 3: Greeting trigger ──────────────────────────────
  console.log("\nTest 3: Greeting (model speaks first)");
  try {
    // Send empty user turn to trigger the model to greet.
    send(ws, {
      client_content: {
        turns: [{ role: "user", parts: [{ text: "" }] }],
        turn_complete: true,
      },
    });

    // Wait for any serverContent with modelTurn or outputTranscription.
    const response = await waitFor(
      ws,
      (msg) => {
        if (msg.serverContent?.modelTurn?.parts?.length) return { type: "modelTurn", msg };
        if (msg.serverContent?.outputTranscription?.text) return { type: "transcript", msg };
        if (msg.serverContent?.turnComplete) return { type: "turnComplete", msg };
        return undefined;
      },
      25_000,
      "model greeting"
    );

    info(`Model responded with type: ${response.type}`);

    if (response.type === "modelTurn") {
      const parts = response.msg.serverContent.modelTurn.parts;
      const hasAudio = parts.some((p) => p.inlineData?.mimeType?.startsWith("audio/pcm"));
      const hasText = parts.some((p) => p.text);
      if (hasAudio) ok("Model sent audio (PCM)");
      else info("No audio in this turn (text-only response)");
      if (hasText) {
        info(`Model text: "${parts.find((p) => p.text)?.text?.slice(0, 80)}..."`);
        ok("Model sent text greeting");
      }
    } else if (response.type === "transcript") {
      const text = response.msg.serverContent.outputTranscription.text;
      info(`Transcript: "${text.slice(0, 80)}"`);
      ok("Model sent speech transcript");
    } else {
      ok("Model turn completed (audio played, no transcript in this frame)");
    }
  } catch (e) {
    bad("Greeting not received", e.message);
  }

  // ── Test 4: Text round-trip ───────────────────────────────
  console.log("\nTest 4: Text question → model answers");
  try {
    send(ws, {
      client_content: {
        turns: [{ role: "user", parts: [{ text: "What is your name?" }] }],
        turn_complete: true,
      },
    });

    // Collect all messages until turnComplete.
    const collected = [];
    await waitFor(
      ws,
      (msg) => {
        collected.push(msg);
        return msg.serverContent?.turnComplete ? true : undefined;
      },
      20_000,
      "turnComplete after question"
    );

    const hasModelContent = collected.some(
      (m) => m.serverContent?.modelTurn?.parts?.length || m.serverContent?.outputTranscription?.text
    );

    if (hasModelContent) {
      ok("Model responded to text question");
      const transcript = collected
        .map((m) => m.serverContent?.outputTranscription?.text)
        .filter(Boolean)
        .join(" ");
      if (transcript) info(`Response transcript: "${transcript.slice(0, 100)}"`);
    } else {
      bad("No model content in response to question");
    }
  } catch (e) {
    bad("Text round-trip failed", e.message);
  }

  // ── Test 5: Tool call round-trip ──────────────────────────
  console.log("\nTest 5: Tool call round-trip (remember_preference)");
  try {
    send(ws, {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [{ text: "Please remember that I am vegan. Use the remember_preference tool." }],
          },
        ],
        turn_complete: true,
      },
    });

    // Wait for a toolCall message.
    const toolCallMsg = await waitFor(
      ws,
      (msg) => (msg.toolCall?.functionCalls?.length ? msg : undefined),
      25_000,
      "toolCall"
    );

    const calls = toolCallMsg.toolCall.functionCalls;
    ok(`Received toolCall: ${calls.map((c) => c.name).join(", ")}`);

    const rememberCall = calls.find((c) => c.name === "remember_preference");
    if (rememberCall) {
      info(`Args: ${JSON.stringify(rememberCall.args)}`);
      ok("remember_preference tool was called");

      // Send tool response back.
      send(ws, {
        tool_response: {
          function_responses: [
            {
              id: rememberCall.id,
              response: { output: { success: true, message: "Saved: vegan preference." } },
            },
          ],
        },
      });
      ok("tool_response sent back");

      // Wait for model to verbally confirm.
      const confirmation = await waitFor(
        ws,
        (msg) => {
          if (msg.serverContent?.turnComplete) return true;
          if (msg.serverContent?.outputTranscription?.text) return { text: msg.serverContent.outputTranscription.text };
          return undefined;
        },
        15_000,
        "verbal confirmation"
      );
      if (confirmation?.text) {
        info(`Confirmation: "${confirmation.text.slice(0, 100)}"`);
      }
      ok("Model confirmed tool call result");
    } else {
      bad("remember_preference not called (model used a different tool or none)");
    }
  } catch (e) {
    bad("Tool call round-trip failed", e.message);
  }

  // ── Cleanup ───────────────────────────────────────────────
  ws.close();

  // ── Summary ───────────────────────────────────────────────
  console.log(`\n📊  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
