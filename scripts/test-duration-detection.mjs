#!/usr/bin/env node
// ============================================================
// Unit tests for detectPlanDuration logic
// Mirror of the function in lib/langgraph/planner.ts
// Run: node scripts/test-duration-detection.mjs
// ============================================================

// --- Mirror implementation (must match planner.ts) ---

function nextWeekday(targetDay) {
  const now = new Date();
  const diff = (targetDay - now.getDay() + 7) % 7;
  const d = new Date(now);
  d.setDate(now.getDate() + (diff === 0 ? 0 : diff));
  return d;
}

function toDateStr(d) {
  return d.toISOString().split("T")[0];
}

function detectPlanDuration(request) {
  const text = request.toLowerCase();

  // Explicit digit always wins; word-map is only a fallback when no digit was found.
  const dayMatch = text.match(/(\d+)\s*[-\s]?days?/);
  let numDays = 1;
  if (dayMatch) {
    numDays = parseInt(dayMatch[1]);
  } else {
    const wordDays = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, week: 7, weekend: 2 };
    for (const [word, n] of Object.entries(wordDays)) {
      if (text.includes(word + " day") || text.includes(word + "-day") || (word === "weekend" && text.includes("weekend"))) {
        numDays = n;
        break;
      }
    }
  }
  numDays = Math.min(Math.max(numDays, 1), 7);

  let startDate = toDateStr(new Date());
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < weekdays.length; i++) {
    if (text.includes(weekdays[i])) {
      startDate = toDateStr(nextWeekday(i));
      break;
    }
  }
  if (text.includes("tomorrow")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    startDate = toDateStr(tomorrow);
  }
  if (text.includes("this weekend") || text.includes("weekend")) {
    startDate = toDateStr(nextWeekday(6));
    if (numDays === 1) numDays = 2;
  }
  if (text.includes("next week")) {
    const nextMon = new Date();
    nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7 || 7));
    startDate = toDateStr(nextMon);
    if (numDays === 1) numDays = 5;
  }

  const tzOffset = text.includes("tokyo") || text.includes("japan") ? "+09:00"
    : text.includes("london") || text.includes("uk") ? "+01:00"
    : text.includes("new york") || text.includes("nyc") ? "-04:00"
    : text.includes("paris") || text.includes("france") ? "+02:00"
    : text.includes("los angeles") || text.includes("la ") ? "-07:00"
    : text.includes("sydney") || text.includes("australia") ? "+10:00"
    : text.includes("dubai") ? "+04:00"
    : text.includes("singapore") || text.includes("bangkok") ? "+08:00"
    : "+09:00";

  return { numDays, startDate, tzOffset };
}

// --- Test runner ---

let passed = 0;
let failed = 0;

function assert(label, condition, got) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${got !== undefined ? ` (got ${got})` : ""}`);
    failed++;
  }
}

// ── numDays detection ────────────────────────────────────────
console.log("\n🧪 numDays — explicit digit");
assert("'3 day trip' → 3",          detectPlanDuration("3 day trip to Tokyo").numDays === 3, detectPlanDuration("3 day trip to Tokyo").numDays);
assert("'3 days in Tokyo' → 3",     detectPlanDuration("3 days in Tokyo").numDays === 3, detectPlanDuration("3 days in Tokyo").numDays);
assert("'3-day itinerary' → 3",     detectPlanDuration("3-day itinerary").numDays === 3, detectPlanDuration("3-day itinerary").numDays);
assert("'5 days' → 5",              detectPlanDuration("plan 5 days in Paris").numDays === 5, detectPlanDuration("plan 5 days in Paris").numDays);
assert("'7 days' → 7",              detectPlanDuration("7 days in Japan").numDays === 7, detectPlanDuration("7 days in Japan").numDays);
assert("'10 days' → 7 (capped)",    detectPlanDuration("10 days trip").numDays === 7, detectPlanDuration("10 days trip").numDays);
assert("'1 day' → 1",               detectPlanDuration("plan 1 day in Tokyo").numDays === 1, detectPlanDuration("plan 1 day in Tokyo").numDays);

console.log("\n🧪 numDays — digit wins over word (regression for '4 days instead of 3')");
assert("'3 day weekend trip' → 3 (not 2)",  detectPlanDuration("plan a 3 day weekend trip to Tokyo").numDays === 3, detectPlanDuration("plan a 3 day weekend trip to Tokyo").numDays);
assert("'3 days this weekend' → 3 (not 2)", detectPlanDuration("3 days this weekend in Kyoto").numDays === 3, detectPlanDuration("3 days this weekend in Kyoto").numDays);
assert("'2 day week trip' → 2 (not 7)",     detectPlanDuration("2 day week trip").numDays === 2, detectPlanDuration("2 day week trip").numDays);

console.log("\n🧪 numDays — word fallback (no digit)");
assert("'weekend' → 2",             detectPlanDuration("plan a weekend trip").numDays === 2, detectPlanDuration("plan a weekend trip").numDays);
assert("'three day trip' → 3",      detectPlanDuration("three day trip to London").numDays === 3, detectPlanDuration("three day trip to London").numDays);
assert("'one day' → 1",             detectPlanDuration("one day in Tokyo").numDays === 1, detectPlanDuration("one day in Tokyo").numDays);
assert("'no day mention' → 1",      detectPlanDuration("plan my Saturday in Tokyo").numDays === 1, detectPlanDuration("plan my Saturday in Tokyo").numDays);

console.log("\n🧪 numDays — edge cases");
assert("'0 days' → 1 (clamp min)",  detectPlanDuration("0 days").numDays === 1, detectPlanDuration("0 days").numDays);

// ── timezone detection ───────────────────────────────────────
console.log("\n🧪 timezone detection");
assert("Tokyo → +09:00",  detectPlanDuration("Plan my trip to Tokyo").tzOffset === "+09:00");
assert("Japan → +09:00",  detectPlanDuration("3 days in Japan").tzOffset === "+09:00");
assert("London → +01:00", detectPlanDuration("weekend in London").tzOffset === "+01:00");
assert("NYC → -04:00",    detectPlanDuration("trip to NYC").tzOffset === "-04:00");
assert("Paris → +02:00",  detectPlanDuration("a day in Paris").tzOffset === "+02:00");
assert("Dubai → +04:00",  detectPlanDuration("Dubai weekend").tzOffset === "+04:00");
assert("Default → +09:00",detectPlanDuration("plan my day").tzOffset === "+09:00");

// ── Summary ──────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
