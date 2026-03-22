/**
 * Pure utility functions shared across itinerary routes.
 * Extracted here so they can be unit-tested without Next.js / Supabase deps.
 */

import type { FoodSuggestion } from "@/types";

// ── Date helpers ─────────────────────────────────────────────

/** Build a YYYY-MM-DD string without timezone drift. */
export function addDays(startDate: string, daysToAdd: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(y, m - 1, d + daysToAdd);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

// ── Timestamp helpers ────────────────────────────────────────

/**
 * Build a DB-ready timestamp for a review reschedule.
 *
 * @param newDatetime  Gemini output: "YYYY-MM-DDTHH:MM"
 * @param originalTs   Existing DB value: "YYYY-MM-DDTHH:MM:SS+HH:MM"
 * @returns            "YYYY-MM-DDTHH:MM:SS+HH:MM" with the original timezone suffix
 *
 * The slice(16) of originalTs gives ":SS+HH:MM" (e.g. ":00+01:00").
 * Appending that directly to the "HH:MM"-tailed Gemini string produces the
 * correct result. Adding an extra ":00" before the suffix would double the
 * seconds component → the invalid "…T01:00:00:00+01:00" error we saw.
 */
export function buildReviewTimestamp(newDatetime: string, originalTs: string): string {
  const tzSuffix = originalTs.slice(16); // ":00+01:00" or ":00Z" etc.
  return newDatetime + tzSuffix;
}

/**
 * Derive which city a node belongs to based on its scheduled date and the
 * trip's city date ranges.
 */
export function nodeCity(
  startTime: string,
  cities: Array<{ city: string; date_range: { from: string; to: string } }>
): string | undefined {
  const date = startTime.split("T")[0];
  return cities.find((c) => date >= c.date_range.from && date <= c.date_range.to)?.city;
}

// ── Food helpers ─────────────────────────────────────────────

/** Normalise a date-range object that may use either {from,to} or {start,end} keys. */
export function normaliseDateRange(
  raw: { from?: string; to?: string; start?: string; end?: string }
): { start: string; end: string } {
  return {
    start: raw.start ?? raw.from ?? "",
    end: raw.end ?? raw.to ?? "",
  };
}

/**
 * Auto-pick N breakfasts + N lunches + N dinners per city (N = days in that
 * city), plus at most 1 snack per city.
 */
export function autoPickFood(
  food: FoodSuggestion[],
  cityDays: Record<string, number>
): FoodSuggestion[] {
  const cities = [...new Set(food.map((f) => f.city))];
  const picked: FoodSuggestion[] = [];
  for (const city of cities) {
    const n = cityDays[city] ?? 1;
    const cityFood = food.filter((f) => f.city === city);
    const byType = (t: string) => cityFood.filter((f) => f.meal_type === t).slice(0, n);
    picked.push(...byType("breakfast"));
    picked.push(...byType("lunch"));
    picked.push(...byType("dinner"));
    picked.push(...byType("snack").slice(0, 1));
  }
  return picked;
}
