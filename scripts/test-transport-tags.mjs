#!/usr/bin/env node
// ============================================================
// Unit tests for transport tag computation logic
// Mirror of parseCost + computeTransportTags in BranchingTimeline.tsx
// Run: node scripts/test-transport-tags.mjs
// ============================================================

// --- Mirror implementation (must match BranchingTimeline.tsx) ---

function parseCost(costStr) {
  if (!costStr) return Infinity;
  const lower = costStr.toLowerCase().trim();
  if (lower === "free" || lower === "¥0" || lower === "$0" || lower === "€0") return 0;
  const match = lower.match(/[\d][0-9,]*/);
  if (!match) return Infinity;
  return parseInt(match[0].replace(/,/g, ""), 10);
}

function computeTransportTags(options) {
  if (options.length === 0) return [];
  const durations = options.map((o) => o.duration_minutes ?? Infinity);
  const costs = options.map((o) => parseCost(o.cost_estimate));
  const minDuration = Math.min(...durations);
  const minCost = Math.min(...costs);
  return options.map((_, i) => ({
    fastest: durations[i] === minDuration,
    cheapest: costs[i] === minCost && minCost !== Infinity,
  }));
}

// --- Test runner ---

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// ── parseCost ────────────────────────────────────────────────
console.log("\n🧪 parseCost — string parsing");
assert("'Free' → 0",           parseCost("Free") === 0);
assert("'free' → 0 (case)",    parseCost("free") === 0);
assert("'¥0' → 0",             parseCost("¥0") === 0);
assert("'$0' → 0",             parseCost("$0") === 0);
assert("'€0' → 0",             parseCost("€0") === 0);
assert("'¥200' → 200",         parseCost("¥200") === 200);
assert("'~¥1,500' → 1500",     parseCost("~¥1,500") === 1500);
assert("'$5.50' → 5",          parseCost("$5.50") === 5);
assert("'€12' → 12",           parseCost("€12") === 12);
assert("'¥1,500–3,000' → 1500", parseCost("¥1,500–3,000") === 1500);
assert("undefined → Infinity",  parseCost(undefined) === Infinity);
assert("null → Infinity",       parseCost(null) === Infinity);
assert("no digits → Infinity",  parseCost("price varies") === Infinity);

// ── computeTransportTags — basic case ────────────────────────
console.log("\n🧪 computeTransportTags — basic 3-option case");
{
  const opts = [
    { mode: "walk",  duration_minutes: 25, cost_estimate: "Free" },
    { mode: "train", duration_minutes: 12, cost_estimate: "¥200" },
    { mode: "taxi",  duration_minutes:  8, cost_estimate: "¥1,500" },
  ];
  const tags = computeTransportTags(opts);
  assert("walk  → NOT fastest (25min)",  !tags[0].fastest);
  assert("walk  → cheapest (Free=¥0)",    tags[0].cheapest);
  assert("train → NOT fastest (12min)",  !tags[1].fastest);
  assert("train → NOT cheapest (¥200)",  !tags[1].cheapest);
  assert("taxi  → fastest (8min)",        tags[2].fastest);
  assert("taxi  → NOT cheapest (¥1,500)", !tags[2].cheapest);
}

// ── Tied duration ────────────────────────────────────────────
console.log("\n🧪 computeTransportTags — tie on duration");
{
  const opts = [
    { mode: "train", duration_minutes: 10, cost_estimate: "¥200" },
    { mode: "bus",   duration_minutes: 10, cost_estimate: "¥150" },
  ];
  const tags = computeTransportTags(opts);
  assert("train → fastest (tied)",  tags[0].fastest);
  assert("bus   → fastest (tied)",  tags[1].fastest);
  assert("train → NOT cheapest",   !tags[0].cheapest);
  assert("bus   → cheapest (¥150)", tags[1].cheapest);
}

// ── Tied cost ────────────────────────────────────────────────
console.log("\n🧪 computeTransportTags — tie on cost");
{
  const opts = [
    { mode: "train", duration_minutes: 20, cost_estimate: "¥200" },
    { mode: "bus",   duration_minutes: 35, cost_estimate: "¥200" },
  ];
  const tags = computeTransportTags(opts);
  assert("train → fastest",              tags[0].fastest);
  assert("bus   → NOT fastest",         !tags[1].fastest);
  assert("train → cheapest (tied)",      tags[0].cheapest);
  assert("bus   → cheapest (tied)",      tags[1].cheapest);
}

// ── All unknown cost ─────────────────────────────────────────
console.log("\n🧪 computeTransportTags — all costs unknown");
{
  const opts = [
    { mode: "walk",  duration_minutes: 20 },
    { mode: "taxi",  duration_minutes:  5 },
  ];
  const tags = computeTransportTags(opts);
  assert("walk → NOT cheapest (no cost data)", !tags[0].cheapest);
  assert("taxi → NOT cheapest (no cost data)", !tags[1].cheapest);
  assert("walk → NOT fastest",                 !tags[0].fastest);
  assert("taxi → fastest",                      tags[1].fastest);
}

// ── All free ─────────────────────────────────────────────────
console.log("\n🧪 computeTransportTags — all free");
{
  const opts = [
    { mode: "walk", duration_minutes: 30, cost_estimate: "Free" },
    { mode: "bus",  duration_minutes: 15, cost_estimate: "Free" },
  ];
  const tags = computeTransportTags(opts);
  assert("walk → NOT fastest (30min)", !tags[0].fastest);
  assert("bus  → fastest (15min)",      tags[1].fastest);
  assert("walk → cheapest (tied free)", tags[0].cheapest);
  assert("bus  → cheapest (tied free)", tags[1].cheapest);
}

// ── Single option ────────────────────────────────────────────
console.log("\n🧪 computeTransportTags — single option");
{
  const opts = [{ mode: "train", duration_minutes: 15, cost_estimate: "¥300" }];
  const tags = computeTransportTags(opts);
  assert("single → fastest",  tags[0].fastest);
  assert("single → cheapest", tags[0].cheapest);
}

// ── Empty ────────────────────────────────────────────────────
console.log("\n🧪 computeTransportTags — empty array");
{
  const tags = computeTransportTags([]);
  assert("empty → returns []", tags.length === 0);
}

// ── LLM-provided tags ignored ────────────────────────────────
// This is the key regression test: Gemini tags must NOT be trusted.
console.log("\n🧪 computeTransportTags — ignores LLM-provided tags (regression)");
{
  const opts = [
    // LLM wrongly labels the walk as "fastest" and the taxi as "cheapest"
    { mode: "walk",  duration_minutes: 30, cost_estimate: "Free",   tags: ["fastest"] },
    { mode: "taxi",  duration_minutes:  8, cost_estimate: "¥2,000", tags: ["cheapest"] },
  ];
  const tags = computeTransportTags(opts);
  assert("walk → NOT fastest (despite LLM tag)",  !tags[0].fastest);
  assert("walk → cheapest (Free < ¥2,000)",        tags[0].cheapest);
  assert("taxi → fastest (8min < 30min)",           tags[1].fastest);
  assert("taxi → NOT cheapest (despite LLM tag)", !tags[1].cheapest);
}

// ── Summary ──────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
