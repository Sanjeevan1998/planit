#!/usr/bin/env node
// ============================================================
// Regression tests for ChatPanel callback trigger conditions.
//
// THE BUG THIS TESTS:
//   ChatPanel.onItineraryUpdate was only called when
//   data.itinerary_update || data.new_nodes || data.transport_options
//   — but the suggest-mode response carries NONE of those fields.
//   So the dashboard never received the signal to switch to the
//   ActivityPicker, and the old itinerary stayed on screen forever.
//
// These tests mirror the exact conditional in ChatPanel.tsx.
// Run: node scripts/test-chat-panel-callback.mjs
// ============================================================

let passed = 0;
let failed = 0;

function assert(label, condition, extra = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${extra ? `  →  ${extra}` : ""}`);
    failed++;
  }
}

// Mirror of ChatPanel.tsx line 85 — keep in sync with the real condition
function shouldNotifyParent(data) {
  return !!(
    data.itinerary_update ||
    data.new_nodes?.length ||
    data.transport_options?.length ||
    data.trip_suggestions
  );
}

// ── Suggest mode ─────────────────────────────────────────────
console.log("\n🧪 ChatPanel callback — suggest mode responses");

assert(
  "suggest mode with trip_suggestions fires callback",
  shouldNotifyParent({
    response: "Found 19 activities",
    mode: "suggest",
    trip_suggestions: {
      trip_title: "Weekend in Paris",
      destination: "Paris",
      start_date: "2026-03-23",
      end_date: "2026-03-24",
      cities: [],
    },
  })
);

assert(
  "suggest mode WITHOUT trip_suggestions does NOT fire (nothing to act on)",
  !shouldNotifyParent({
    response: "Found 0 activities",
    mode: "suggest",
    trip_suggestions: undefined,
  })
);

assert(
  "suggest mode with null trip_suggestions does NOT fire",
  !shouldNotifyParent({
    response: "Something went wrong",
    mode: "suggest",
    trip_suggestions: null,
  })
);

// ── Itinerary updates ─────────────────────────────────────────
console.log("\n🧪 ChatPanel callback — itinerary update responses");

assert(
  "itinerary_update fires callback",
  shouldNotifyParent({
    response: "Your itinerary is updated",
    itinerary_update: { title: "My Trip" },
  })
);

assert(
  "new_nodes fires callback",
  shouldNotifyParent({
    response: "Added a node",
    new_nodes: [{ id: "node_1" }],
  })
);

assert(
  "transport_options fires callback",
  shouldNotifyParent({
    response: "Here are transport options",
    transport_options: [{ mode: "train" }],
  })
);

// ── Pure chat — no side effects ───────────────────────────────
console.log("\n🧪 ChatPanel callback — pure chat responses (should NOT fire)");

assert(
  "plain chat response does NOT fire",
  !shouldNotifyParent({
    response: "That sounds great! Tell me more.",
  })
);

assert(
  "empty response does NOT fire",
  !shouldNotifyParent({ response: "" })
);

assert(
  "response with suggestions array (quick-reply chips) does NOT fire",
  !shouldNotifyParent({
    response: "Try these:",
    suggestions: ["Plan 3 days in Tokyo", "What's nearby?"],
  })
);

// ── Edge cases ────────────────────────────────────────────────
console.log("\n🧪 ChatPanel callback — edge cases");

assert(
  "empty new_nodes array does NOT fire",
  !shouldNotifyParent({ response: "...", new_nodes: [] })
);

assert(
  "empty transport_options array does NOT fire",
  !shouldNotifyParent({ response: "...", transport_options: [] })
);

assert(
  "multiple trigger fields together fires callback",
  shouldNotifyParent({
    response: "Full update",
    itinerary_update: { title: "Trip" },
    trip_suggestions: { cities: [] },
  })
);

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
