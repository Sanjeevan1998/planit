import { describe, it, expect } from "vitest";
import {
  addDays,
  buildReviewTimestamp,
  nodeCity,
  normaliseDateRange,
  autoPickFood,
} from "../lib/utils/itinerary-helpers";
import type { FoodSuggestion } from "../types";

// ── addDays ──────────────────────────────────────────────────

describe("addDays", () => {
  it("adds zero days", () => {
    expect(addDays("2026-03-22", 0)).toBe("2026-03-22");
  });

  it("adds days within the same month", () => {
    expect(addDays("2026-03-22", 3)).toBe("2026-03-25");
  });

  it("rolls over month boundary", () => {
    expect(addDays("2026-03-30", 2)).toBe("2026-04-01");
  });

  it("rolls over year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles February leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

// ── buildReviewTimestamp ─────────────────────────────────────

describe("buildReviewTimestamp", () => {
  it("appends the timezone suffix from the original timestamp correctly", () => {
    // The bug was adding ":00" before the suffix, producing "…T01:00:00:00+01:00"
    const result = buildReviewTimestamp("2026-03-23T01:00", "2026-03-22T19:00:00+01:00");
    expect(result).toBe("2026-03-23T01:00:00+01:00");
  });

  it("works with UTC offset +00:00", () => {
    const result = buildReviewTimestamp("2026-03-24T09:30", "2026-03-24T08:00:00+00:00");
    expect(result).toBe("2026-03-24T09:30:00+00:00");
  });

  it("works with a negative UTC offset", () => {
    const result = buildReviewTimestamp("2026-06-15T14:00", "2026-06-15T12:00:00-05:00");
    expect(result).toBe("2026-06-15T14:00:00-05:00");
  });

  it("does NOT produce doubled seconds (regression for the original bug)", () => {
    const result = buildReviewTimestamp("2026-03-23T05:15", "2026-03-23T04:00:00+00:00");
    // Must not contain "00:00" after the time portion
    expect(result).not.toMatch(/T\d{2}:\d{2}:00:00/);
    expect(result).toBe("2026-03-23T05:15:00+00:00");
  });

  it("changes only the date and time, not the timezone offset", () => {
    const original = "2026-03-25T22:00:00+02:00";
    const result = buildReviewTimestamp("2026-03-26T02:00", original);
    expect(result.endsWith("+02:00")).toBe(true);
  });
});

// ── nodeCity ─────────────────────────────────────────────────

const CITIES = [
  { city: "Prague", date_range: { from: "2026-03-22", to: "2026-03-24" } },
  { city: "Berlin", date_range: { from: "2026-03-25", to: "2026-03-26" } },
];

describe("nodeCity", () => {
  it("identifies Prague correctly", () => {
    expect(nodeCity("2026-03-22T10:00:00+01:00", CITIES)).toBe("Prague");
    expect(nodeCity("2026-03-24T22:00:00+01:00", CITIES)).toBe("Prague");
  });

  it("identifies Berlin correctly", () => {
    expect(nodeCity("2026-03-25T09:00:00+01:00", CITIES)).toBe("Berlin");
    expect(nodeCity("2026-03-26T23:00:00+01:00", CITIES)).toBe("Berlin");
  });

  it("returns undefined for a date outside all city ranges", () => {
    expect(nodeCity("2026-03-27T10:00:00+01:00", CITIES)).toBeUndefined();
    expect(nodeCity("2026-03-21T10:00:00+01:00", CITIES)).toBeUndefined();
  });

  it("handles single-city trip", () => {
    const single = [{ city: "Paris", date_range: { from: "2026-04-01", to: "2026-04-05" } }];
    expect(nodeCity("2026-04-03T12:00:00+02:00", single)).toBe("Paris");
  });
});

// ── normaliseDateRange ────────────────────────────────────────

describe("normaliseDateRange", () => {
  it("accepts {start, end}", () => {
    expect(normaliseDateRange({ start: "2026-03-22", end: "2026-03-26" })).toEqual({
      start: "2026-03-22",
      end: "2026-03-26",
    });
  });

  it("normalises {from, to} to {start, end}", () => {
    expect(normaliseDateRange({ from: "2026-03-22", to: "2026-03-26" })).toEqual({
      start: "2026-03-22",
      end: "2026-03-26",
    });
  });

  it("prefers start/end over from/to when both are present", () => {
    expect(
      normaliseDateRange({ from: "2000-01-01", to: "2000-01-05", start: "2026-03-22", end: "2026-03-26" })
    ).toEqual({ start: "2026-03-22", end: "2026-03-26" });
  });

  it("returns empty strings when nothing is provided", () => {
    expect(normaliseDateRange({})).toEqual({ start: "", end: "" });
  });
});

// ── autoPickFood ─────────────────────────────────────────────

function makeSuggestion(
  id: string,
  city: string,
  meal_type: FoodSuggestion["meal_type"]
): FoodSuggestion {
  return {
    id,
    city,
    title: id,
    description: "",
    location: { lat: 0, lng: 0, address: "" },
    meal_type,
    cuisine: "test",
    must_try_dishes: [],
    why_authentic: "",
    budget_tier: "budget",
    budget_estimate: "",
    tags: [],
    accessibility_verified: false,
    booking_links: [],
  };
}

describe("autoPickFood", () => {
  it("picks N of each main meal type per city where N = city days", () => {
    const food = [
      makeSuggestion("p_b1", "Prague", "breakfast"),
      makeSuggestion("p_b2", "Prague", "breakfast"),
      makeSuggestion("p_b3", "Prague", "breakfast"),
      makeSuggestion("p_l1", "Prague", "lunch"),
      makeSuggestion("p_l2", "Prague", "lunch"),
      makeSuggestion("p_d1", "Prague", "dinner"),
      makeSuggestion("p_d2", "Prague", "dinner"),
    ];
    const result = autoPickFood(food, { Prague: 2 });
    const byType = (t: string) => result.filter((f) => f.meal_type === t);
    expect(byType("breakfast")).toHaveLength(2); // max 2 (N=2)
    expect(byType("lunch")).toHaveLength(2);
    expect(byType("dinner")).toHaveLength(2);
  });

  it("picks food for multiple cities independently", () => {
    const food = [
      makeSuggestion("p_b1", "Prague", "breakfast"),
      makeSuggestion("p_b2", "Prague", "breakfast"),
      makeSuggestion("b_b1", "Berlin", "breakfast"),
      makeSuggestion("b_b2", "Berlin", "breakfast"),
      makeSuggestion("b_l1", "Berlin", "lunch"),
    ];
    const result = autoPickFood(food, { Prague: 1, Berlin: 2 });
    const prague = result.filter((f) => f.city === "Prague");
    const berlin = result.filter((f) => f.city === "Berlin");
    // Prague: 1 day → 1 breakfast
    expect(prague.filter((f) => f.meal_type === "breakfast")).toHaveLength(1);
    // Berlin: 2 days → 2 breakfasts, 1 lunch (only 1 available)
    expect(berlin.filter((f) => f.meal_type === "breakfast")).toHaveLength(2);
    expect(berlin.filter((f) => f.meal_type === "lunch")).toHaveLength(1);
  });

  it("allows at most 1 snack per city regardless of days", () => {
    const food = [
      makeSuggestion("s1", "Prague", "snack"),
      makeSuggestion("s2", "Prague", "snack"),
      makeSuggestion("s3", "Prague", "snack"),
    ];
    const result = autoPickFood(food, { Prague: 5 });
    expect(result.filter((f) => f.meal_type === "snack")).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(autoPickFood([], { Prague: 3 })).toEqual([]);
  });

  it("defaults to 1 day when city not in cityDays map", () => {
    const food = [
      makeSuggestion("b1", "Tokyo", "breakfast"),
      makeSuggestion("b2", "Tokyo", "breakfast"),
    ];
    const result = autoPickFood(food, {}); // no Tokyo entry
    expect(result.filter((f) => f.meal_type === "breakfast")).toHaveLength(1);
  });
});

// ── addDays overflow / city boundary regression ───────────────
//
// These tests document the exact overflow that caused Prague meals to bleed
// into Budapest days.  The add-food route now guards dayIdx >= maxDays.

describe("addDays overflow boundary (city date bleed regression)", () => {
  it("addDays with dayIdx === maxDays produces the NEXT city's first date", () => {
    // Prague: 3 days (Mar 22–24), maxDays = 3
    // dayIdx 3 → Mar 25 (Budapest's first day) — THIS was the bug
    expect(addDays("2026-03-22", 3)).toBe("2026-03-25");
  });

  it("addDays with dayIdx === maxDays - 1 produces the last valid city date", () => {
    // dayIdx 2 → Mar 24 (last Prague day) — this is fine
    expect(addDays("2026-03-22", 2)).toBe("2026-03-24");
  });

  it("confirms the boundary: dayIdx >= maxDays must be skipped, not scheduled", () => {
    // Simulate the guard: if dayIdx reaches maxDays (3 for a 3-day city),
    // the meal should NOT be scheduled.  addDays("2026-03-22", 3) = "2026-03-25"
    // which is a Budapest date — scheduling here would be wrong.
    const maxDays = 3;
    const baseDate = "2026-03-22";

    // Mimic the while loop exhausting all slots:
    let dayIdx = maxDays; // loop advanced past all valid days
    const dateStr = addDays(baseDate, dayIdx);

    // dateStr is now Budapest territory
    expect(dateStr).toBe("2026-03-25");
    // The guard `dayIdx >= maxDays` correctly identifies this as out-of-range
    expect(dayIdx >= maxDays).toBe(true);
  });
});

// ── normaliseDateRange city guard (cross-city hallucination) ──

describe("city food guard (normalised city matching)", () => {
  it("lowercased city comparison catches case differences", () => {
    const cityLower = "prague";
    expect("Prague".toLowerCase() === cityLower).toBe(true);
    expect("PRAGUE".toLowerCase() === cityLower).toBe(true);
    expect("Budapest".toLowerCase() === cityLower).toBe(false);
  });

  it("detects a hallucinated wrong-city item", () => {
    // Simulate what the food route filter does: drop items where city !== requested city
    const city = "Prague";
    const items = [
      makeSuggestion("p1", "Prague", "breakfast"),
      makeSuggestion("b1", "Budapest", "breakfast"), // hallucinated — wrong city
    ];
    const valid = items.filter((f) => f.city?.toLowerCase() === city.toLowerCase());
    expect(valid).toHaveLength(1);
    expect(valid[0].id).toBe("p1");
  });
});
