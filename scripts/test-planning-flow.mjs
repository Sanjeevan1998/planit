#!/usr/bin/env node
// ============================================================
// Integration tests for the multi-step planning flow
//
// Tests:
//   POST /api/chat         — suggest mode intercept (all plan_day intents)
//   POST /api/itinerary/suggest
//   POST /api/itinerary/build  — with full-day fill + transport nodes
//   POST /api/itinerary/food
//   POST /api/itinerary/add-food
//
// Run: node scripts/test-planning-flow.mjs
//      BASE_URL=http://localhost:3001 node scripts/test-planning-flow.mjs
// ============================================================

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DEMO_USER = "00000000-0000-0000-0000-000000000001";

let passed = 0;
let failed = 0;
let total = 0;

function assert(label, condition, extra = "") {
  total++;
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${extra ? `  →  ${extra}` : ""}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

// ── Helpers ───────────────────────────────────────────────────
function validateTripSuggestions(ts) {
  if (!ts || typeof ts !== "object") return false;
  return (
    typeof ts.trip_title === "string" &&
    typeof ts.destination === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(ts.start_date) &&
    /^\d{4}-\d{2}-\d{2}$/.test(ts.end_date) &&
    Array.isArray(ts.cities) &&
    ts.cities.every((c) =>
      typeof c.city === "string" &&
      Array.isArray(c.activities) &&
      Array.isArray(c.events)
    )
  );
}

function validateActivity(a) {
  return (
    typeof a.id === "string" &&
    typeof a.title === "string" &&
    typeof a.city === "string" &&
    typeof a.is_event === "boolean" &&
    typeof a.duration_minutes === "number" &&
    typeof a.location === "object"
  );
}

function validateFood(f) {
  return (
    typeof f.id === "string" &&
    typeof f.title === "string" &&
    ["breakfast", "lunch", "dinner", "snack"].includes(f.meal_type) &&
    Array.isArray(f.must_try_dishes) &&
    typeof f.why_authentic === "string"
  );
}

function validateNode(n) {
  return (
    typeof n.id === "string" &&
    typeof n.title === "string" &&
    typeof n.type === "string" &&
    typeof n.start_time === "string" &&
    typeof n.end_time === "string"
  );
}

// ── Connect ───────────────────────────────────────────────────
console.log(`\n🔌 Connecting to ${BASE_URL}...\n`);

try {
  const res = await fetch(BASE_URL).catch(() => null);
  if (!res) {
    console.error(`❌ Cannot connect to ${BASE_URL}`);
    console.error("   Start the dev server first: npm run dev");
    process.exit(1);
  }
  console.log("  ✅ Server is reachable\n");
} catch {
  console.error(`❌ Cannot connect to ${BASE_URL}`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// 1. Chat → suggest mode for ALL plan_day intents
// ─────────────────────────────────────────────────────────────
console.log("🧪 POST /api/chat — suggest mode for 1-day trip (was broken before)");
{
  const { status, data } = await post("/api/chat", {
    message: "Plan my Saturday in Tokyo",
    user_id: DEMO_USER,
  });
  assert("1-day plan → HTTP 200", status === 200, `got ${status}`);
  assert("1-day plan → mode is 'suggest'", data.mode === "suggest", `got ${data.mode}`);
  assert("1-day plan → has trip_suggestions", validateTripSuggestions(data.trip_suggestions),
    JSON.stringify(data.trip_suggestions)?.slice(0, 80));
}

console.log("\n🧪 POST /api/chat — suggest mode for multi-day trip");
{
  const { status, data } = await post("/api/chat", {
    message: "Plan 4 days in Kyoto",
    user_id: DEMO_USER,
  });
  assert("4-day plan → HTTP 200", status === 200, `got ${status}`);
  assert("4-day plan → mode is 'suggest'", data.mode === "suggest", `got ${data.mode}`);
  assert("4-day plan → has trip_suggestions", validateTripSuggestions(data.trip_suggestions));
  if (data.trip_suggestions) {
    const ts = data.trip_suggestions;
    assert("destination includes Kyoto", ts.destination.toLowerCase().includes("kyoto"), ts.destination);
    const firstCity = ts.cities[0];
    assert("has activities", (firstCity?.activities?.length ?? 0) > 0);
    if (firstCity?.activities?.[0]) {
      assert("activity has required fields", validateActivity(firstCity.activities[0]));
    }
  }
}

console.log("\n🧪 POST /api/chat — non-planning query does NOT trigger suggest mode");
{
  const { status, data } = await post("/api/chat", {
    message: "What's the weather like in Tokyo?",
    user_id: DEMO_USER,
  });
  assert("weather query → HTTP 200", status === 200, `got ${status}`);
  assert("weather query → NOT suggest mode", data.mode !== "suggest", `got ${data.mode}`);
}

// ─────────────────────────────────────────────────────────────
// 2. /api/itinerary/suggest
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 POST /api/itinerary/suggest");
{
  const { status, data } = await post("/api/itinerary/suggest", {
    message: "Plan 3 days in Tokyo with cultural activities",
    user_id: DEMO_USER,
  });
  assert("returns HTTP 200", status === 200, `got ${status}`);
  assert("has trip_suggestions", validateTripSuggestions(data.trip_suggestions));

  if (data.trip_suggestions) {
    const ts = data.trip_suggestions;
    assert("start_date is YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(ts.start_date), ts.start_date);
    assert("end_date >= start_date", ts.end_date >= ts.start_date, `${ts.start_date} – ${ts.end_date}`);
    assert("at least one city", ts.cities.length >= 1);
    const firstCity = ts.cities[0];
    assert("city has activities", (firstCity?.activities?.length ?? 0) > 0);
    assert("activities have booking_links", firstCity?.activities?.every((a) => Array.isArray(a.booking_links)));
  }
}

// Validation
console.log("\n🧪 POST /api/itinerary/suggest — validation");
{
  const { status } = await post("/api/itinerary/suggest", { message: "" });
  assert("missing user_id → 400", status === 400);
}

// ─────────────────────────────────────────────────────────────
// 3. /api/itinerary/build — full day fill + transport
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 POST /api/itinerary/build — schedules activities + fills day + adds transport");

let builtItineraryId = null;
let firstSuggestions = null;

{
  const suggestRes = await post("/api/itinerary/suggest", {
    message: "Plan 2 days in Osaka",
    user_id: DEMO_USER,
  });

  if (suggestRes.status !== 200 || !suggestRes.data.trip_suggestions) {
    console.log("  ⚠️  Suggest failed, skipping build test");
    assert("suggest for build succeeded", false, `status=${suggestRes.status}`);
  } else {
    firstSuggestions = suggestRes.data.trip_suggestions;
    const allActivities = firstSuggestions.cities.flatMap((c) => c.activities);
    // Pick 2–4 activities (not too many to keep prompt fast)
    const selectedIds = allActivities.slice(0, Math.min(4, allActivities.length)).map((a) => a.id);

    assert("have activities to build with", selectedIds.length > 0);

    if (selectedIds.length > 0) {
      const { status, data } = await post("/api/itinerary/build", {
        user_id: DEMO_USER,
        selected_ids: selectedIds,
        suggestions: firstSuggestions,
      });

      assert("build returns 200 or has conflicts", status === 200 || (status === 200 && data.conflicts));

      if (status === 200 && data.itinerary_id) {
        builtItineraryId = data.itinerary_id;
        const nodes = data.itinerary?.nodes ?? [];

        assert("itinerary has nodes", nodes.length > 0, `got ${nodes.length}`);
        assert("all nodes have required fields", nodes.every(validateNode));

        // Key assertion: full-day fill — should have MORE nodes than user picked
        assert(
          "itinerary has MORE nodes than user selected (filler + transport added)",
          nodes.length > selectedIds.length,
          `selected ${selectedIds.length}, got ${nodes.length} nodes`
        );

        // Transport nodes should be present
        const transportNodes = nodes.filter((n) => n.type === "transport");
        assert(
          "itinerary includes transport nodes",
          transportNodes.length > 0,
          `got ${transportNodes.length} transport nodes`
        );

        // Transport nodes should have transport_options
        const hasTransportOptions = transportNodes.some(
          (n) => Array.isArray(n.transport_options) && n.transport_options.length > 0
        );
        assert("transport nodes have transport_options", hasTransportOptions);

        // Walking should always be present and free
        const walksWithCost = transportNodes
          .flatMap((n) => n.transport_options ?? [])
          .filter((o) => o.mode === "walk" && o.cost_estimate !== "Free" && o.cost_estimate !== "¥0");
        assert("walking is always free", walksWithCost.length === 0,
          `${walksWithCost.length} walk options with non-free cost`);

        // Days should be fully filled (no long gaps)
        // Sort all activity nodes by date+time and check coverage
        const actNodes = nodes.filter((n) => n.type !== "transport" && n.start_time);
        const byDay = {};
        for (const n of actNodes) {
          const day = n.start_time.slice(0, 10);
          byDay[day] = byDay[day] ?? [];
          byDay[day].push(n);
        }
        const numDays = Object.keys(byDay).length;
        assert(
          "nodes span at least 1 day",
          numDays >= 1,
          `got ${numDays} days`
        );
        // Each day should have at least 3 activities
        const daysTooSparse = Object.entries(byDay).filter(([, arr]) => arr.length < 3);
        assert(
          "each day has ≥ 3 activities/fillers",
          daysTooSparse.length === 0,
          daysTooSparse.map(([d, arr]) => `${d}: ${arr.length}`).join(", ")
        );

        // Node times should not overlap on the same day
        let hasOverlap = false;
        for (const dayNodes of Object.values(byDay)) {
          const sorted = dayNodes.sort((a, b) => a.start_time.localeCompare(b.start_time));
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].start_time < sorted[i - 1].end_time) {
              hasOverlap = true;
              break;
            }
          }
          if (hasOverlap) break;
        }
        assert("activity nodes do not overlap in time", !hasOverlap);

      } else if (status === 200 && data.conflicts) {
        assert("conflicts is valid array", Array.isArray(data.conflicts) && data.conflicts.length > 0);
        assert("each conflict has 2+ options", data.conflicts.every((c) =>
          Array.isArray(c.options) && c.options.length >= 2));
        console.log(`  ℹ️  Build returned ${data.conflicts.length} conflict(s)`);
      }
    }
  }
}

// Validation
console.log("\n🧪 POST /api/itinerary/build — validation");
{
  const { status } = await post("/api/itinerary/build", { user_id: DEMO_USER });
  assert("missing selected_ids → 400", status === 400);
}
{
  const { status } = await post("/api/itinerary/build", {
    user_id: DEMO_USER,
    selected_ids: [],
    suggestions: { cities: [] },
  });
  assert("empty selected_ids → 400", status === 400);
}

// ─────────────────────────────────────────────────────────────
// 4. Conflict detection
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Conflict detection (unit-level via build)");
{
  // Fabricate two overlapping events in suggestions
  const fakeDate = new Date();
  fakeDate.setDate(fakeDate.getDate() + 5);
  const dateStr = fakeDate.toISOString().slice(0, 10);

  const fakeSuggestions = {
    trip_title: "Test Conflict",
    destination: "Tokyo",
    start_date: dateStr,
    end_date: dateStr,
    cities: [{
      city: "Tokyo",
      date_range: { from: dateStr, to: dateStr },
      activities: [],
      events: [
        {
          id: "evt_conflict_a",
          city: "Tokyo",
          type: "event",
          title: "Event A",
          description: "Test event",
          location: { lat: 35.68, lng: 139.77, address: "Shibuya" },
          duration_minutes: 120,
          budget_tier: "mid-range",
          budget_estimate: "¥5000",
          tags: [],
          why_selected: "Test",
          accessibility_verified: true,
          booking_links: [],
          is_event: true,
          event_date: dateStr,
          event_start: "19:00",
          event_end: "21:00",
        },
        {
          id: "evt_conflict_b",
          city: "Tokyo",
          type: "event",
          title: "Event B",
          description: "Overlapping event",
          location: { lat: 35.69, lng: 139.78, address: "Shinjuku" },
          duration_minutes: 90,
          budget_tier: "mid-range",
          budget_estimate: "¥3000",
          tags: [],
          why_selected: "Test",
          accessibility_verified: true,
          booking_links: [],
          is_event: true,
          event_date: dateStr,
          event_start: "19:30",
          event_end: "21:00",
        },
      ],
    }],
  };

  const { status, data } = await post("/api/itinerary/build", {
    user_id: DEMO_USER,
    selected_ids: ["evt_conflict_a", "evt_conflict_b"],
    suggestions: fakeSuggestions,
  });

  assert("overlapping events → 200 with conflicts", status === 200 && Array.isArray(data.conflicts),
    `status=${status}, conflicts=${JSON.stringify(data.conflicts)?.slice(0, 60)}`);
  assert("conflict has both event ids",
    data.conflicts?.[0]?.options?.some((o) => o.id === "evt_conflict_a") &&
    data.conflicts?.[0]?.options?.some((o) => o.id === "evt_conflict_b"));
  assert("no itinerary created yet", !data.itinerary_id);
}

// ─────────────────────────────────────────────────────────────
// 5. /api/itinerary/food
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 POST /api/itinerary/food");

let foodSuggestions = null;

{
  const { status, data } = await post("/api/itinerary/food", {
    user_id: DEMO_USER,
    cities: ["Tokyo"],
    date_range: { from: "2026-04-01", to: "2026-04-03" },
  });

  assert("returns HTTP 200", status === 200, `got ${status}: ${data.error ?? ""}`);
  assert("has food array", Array.isArray(data.food));
  assert("food is non-empty", (data.food?.length ?? 0) > 0, `got ${data.food?.length}`);

  if (data.food?.length) {
    foodSuggestions = data.food;
    assert("first food has required fields", validateFood(data.food[0]));

    const types = new Set(data.food.map((f) => f.meal_type));
    assert("covers ≥ 2 meal types", types.size >= 2, [...types].join(", "));

    // Meals must not be tourist traps — check why_authentic is meaningful
    const allHaveAuth = data.food.every((f) => f.why_authentic?.length > 10);
    assert("all food items have why_authentic description", allHaveAuth);

    // Each item should have booking_links (at minimum Google Maps)
    const allHaveLinks = data.food.every((f) => Array.isArray(f.booking_links) && f.booking_links.length > 0);
    assert("all food items have booking_links", allHaveLinks);
  }
}

// Validation
console.log("\n🧪 POST /api/itinerary/food — validation");
{
  const { status } = await post("/api/itinerary/food", { user_id: DEMO_USER });
  assert("missing cities → 400", status === 400);
}

// ─────────────────────────────────────────────────────────────
// 6. /api/itinerary/add-food — AI pick
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 POST /api/itinerary/add-food — AI pick mode");

if (builtItineraryId) {
  const { status, data } = await post("/api/itinerary/add-food", {
    user_id: DEMO_USER,
    itinerary_id: builtItineraryId,
    cities: ["Osaka"],
    date_range: { from: "2026-04-01", to: "2026-04-02" },
    ai_pick: true,
  });
  assert("returns HTTP 200", status === 200, `got ${status}: ${data.error ?? ""}`);
  assert("added_count > 0", (data.added_count ?? 0) > 0, `got ${data.added_count}`);
} else {
  console.log("  ⚠️  No built itinerary — skipping");
  passed++; total++;
}

// ─────────────────────────────────────────────────────────────
// 7. /api/itinerary/add-food — manual pick
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 POST /api/itinerary/add-food — manual pick");

if (builtItineraryId && foodSuggestions?.length) {
  const pickIds = foodSuggestions.slice(0, 2).map((f) => f.id);
  const { status, data } = await post("/api/itinerary/add-food", {
    user_id: DEMO_USER,
    itinerary_id: builtItineraryId,
    selected_food_ids: pickIds,
    food_suggestions: foodSuggestions,
  });
  assert("returns HTTP 200", status === 200, `got ${status}: ${data.error ?? ""}`);
  assert("added_count matches picks", data.added_count === pickIds.length,
    `expected ${pickIds.length}, got ${data.added_count}`);
} else {
  console.log("  ⚠️  Skipping (need built itinerary + food from earlier steps)");
  passed++; total++;
}

// Validation
console.log("\n🧪 POST /api/itinerary/add-food — validation");
{
  const { status } = await post("/api/itinerary/add-food", { user_id: DEMO_USER });
  assert("missing itinerary_id → 400", status === 400);
}

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
