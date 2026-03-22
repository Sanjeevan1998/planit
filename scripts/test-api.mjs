#!/usr/bin/env node
// ============================================================
// Planit API Integration Tests
// Run: node scripts/test-api.mjs
// Requires the dev server to be running on localhost:3000
// ============================================================

const BASE = "http://localhost:3000";
const DEMO_USER = "00000000-0000-0000-0000-000000000001";

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  ❌ ${label}: ${detail}`);
  failed++;
}

async function test(label, fn) {
  process.stdout.write(`\n🧪 ${label}\n`);
  try {
    await fn();
  } catch (err) {
    fail("Unexpected error", err.message);
  }
}

// ── helpers ─────────────────────────────────────────────────
async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ── 1. Health check ──────────────────────────────────────────
await test("GET / — app is reachable", async () => {
  const res = await fetch(BASE);
  if (res.status < 500) ok(`HTTP ${res.status}`);
  else fail("Server error", `HTTP ${res.status}`);
});

// ── 2. Chat — basic greeting (no DB write needed) ───────────
await test("POST /api/chat — onboarding greeting", async () => {
  const { status, data } = await post("/api/chat", {
    message: "Hello! Who are you?",
    user_id: DEMO_USER,
  });
  if (status !== 200) return fail("Non-200 status", `${status} — ${JSON.stringify(data)}`);
  if (!data.response) return fail("No response field", JSON.stringify(data));
  ok(`Got response: "${data.response.slice(0, 80)}..."`);
});

// ── 3. Chat — plan a day (triggers Gemini + writes itinerary)
await test("POST /api/chat — plan a day in Tokyo", async () => {
  const { status, data } = await post("/api/chat", {
    message: "Plan me a fun Saturday in Tokyo — anime, ramen, and arcades",
    user_id: DEMO_USER,
  });
  if (status !== 200) return fail("Non-200 status", `${status} — ${JSON.stringify(data)}`);
  if (!data.response) return fail("No response field", JSON.stringify(data));
  ok(`Response: "${data.response.slice(0, 80)}..."`);

  if (data.itinerary_update?.nodes?.length) {
    ok(`Itinerary nodes: ${data.itinerary_update.nodes.length}`);
  } else {
    fail("No itinerary nodes returned", JSON.stringify(data).slice(0, 200));
  }
});

// ── 4. Memory API — store a memory ──────────────────────────
await test("POST /api/memory — store preference", async () => {
  const { status, data } = await post("/api/memory", {
    user_id: DEMO_USER,
    memory: {
      category: "likes",
      key: "favorite_food",
      value: "ramen",
    },
  });
  if (status !== 200) return fail("Non-200 status", `${status} — ${JSON.stringify(data)}`);
  ok("Memory stored");
});

// ── 5. Memory API — fetch memories ──────────────────────────
await test("GET /api/memory — fetch all memories", async () => {
  const { status, data } = await get(`/api/memory?user_id=${DEMO_USER}`);
  if (status !== 200) return fail("Non-200 status", `${status} — ${JSON.stringify(data)}`);
  if (!Array.isArray(data.memories)) return fail("No memories array", JSON.stringify(data));
  ok(`${data.memories.length} memories loaded`);
});

// ── 6. Itinerary API — fetch active itinerary ───────────────
await test("GET /api/itinerary — fetch active itinerary", async () => {
  const { status, data } = await get(`/api/itinerary?user_id=${DEMO_USER}`);
  // 404 is OK (no itinerary created yet), 200 is better
  if (status === 200) {
    ok(`Itinerary: "${data.title}" — ${data.nodes?.length ?? 0} nodes`);
  } else if (status === 404) {
    ok("No active itinerary (expected before planning)");
  } else {
    fail("Unexpected status", `${status} — ${JSON.stringify(data)}`);
  }
});

// ── 7. Chat — commute query ──────────────────────────────────
await test("POST /api/chat — commute intent", async () => {
  const { status, data } = await post("/api/chat", {
    message: "How do I get to Shinjuku by train?",
    user_id: DEMO_USER,
    location: { lat: 35.6762, lng: 139.6503, city: "Tokyo" },
  });
  if (status !== 200) return fail("Non-200 status", `${status} — ${JSON.stringify(data)}`);
  if (!data.response) return fail("No response", JSON.stringify(data));
  ok(`Response: "${data.response.slice(0, 80)}..."`);
});

// ── 8. Chat — memory update ──────────────────────────────────
await test("POST /api/chat — remember preference", async () => {
  const { status, data } = await post("/api/chat", {
    message: "I hate loud places and I love matcha",
    user_id: DEMO_USER,
  });
  if (status !== 200) return fail("Non-200 status", `${status} — ${JSON.stringify(data)}`);
  if (!data.response) return fail("No response", JSON.stringify(data));
  ok(`Response: "${data.response.slice(0, 80)}..."`);
  if (data.memory_updates?.length) ok(`Memory updates: ${data.memory_updates.length}`);
});

// ── Summary ──────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
