import { describe, it, expect, beforeEach } from "vitest";
import { usePlanitStore } from "../store/planit";
import type { Itinerary } from "../types";

// Reset store to initial state before each test.
beforeEach(() => {
  usePlanitStore.setState({ itinerary: null });
});

const SAMPLE_ITINERARY: Itinerary = {
  id: "it-1",
  user_id: "00000000-0000-0000-0000-000000000001",
  title: "Tokyo Adventure",
  destination: "Tokyo",
  status: "active",
  budget: "mid-range",
  nodes: [],
  created_at: "2026-03-22T00:00:00Z",
  updated_at: "2026-03-22T00:00:00Z",
};

// ── Initial state ─────────────────────────────────────────────

describe("usePlanitStore — initial state", () => {
  it("itinerary is null on first load", () => {
    expect(usePlanitStore.getState().itinerary).toBeNull();
  });

  it("userId is the demo user by default", () => {
    expect(usePlanitStore.getState().userId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("setItinerary action is a function", () => {
    expect(typeof usePlanitStore.getState().setItinerary).toBe("function");
  });
});

// ── setItinerary ──────────────────────────────────────────────

describe("usePlanitStore — setItinerary", () => {
  it("stores a provided itinerary object", () => {
    usePlanitStore.getState().setItinerary(SAMPLE_ITINERARY);
    expect(usePlanitStore.getState().itinerary).toStrictEqual(SAMPLE_ITINERARY);
  });

  it("overwrites a previously set itinerary", () => {
    usePlanitStore.getState().setItinerary(SAMPLE_ITINERARY);
    const updated = { ...SAMPLE_ITINERARY, title: "Osaka Trip" };
    usePlanitStore.getState().setItinerary(updated);
    expect(usePlanitStore.getState().itinerary?.title).toBe("Osaka Trip");
  });

  it("accepts null to clear the itinerary", () => {
    usePlanitStore.getState().setItinerary(SAMPLE_ITINERARY);
    usePlanitStore.getState().setItinerary(null);
    expect(usePlanitStore.getState().itinerary).toBeNull();
  });

  it("does not mutate the userId when itinerary is set", () => {
    const originalUserId = usePlanitStore.getState().userId;
    usePlanitStore.getState().setItinerary(SAMPLE_ITINERARY);
    expect(usePlanitStore.getState().userId).toBe(originalUserId);
  });

  it("itinerary fields are accessible after set", () => {
    usePlanitStore.getState().setItinerary(SAMPLE_ITINERARY);
    const stored = usePlanitStore.getState().itinerary!;
    expect(stored.id).toBe("it-1");
    expect(stored.title).toBe("Tokyo Adventure");
    expect(stored.destination).toBe("Tokyo");
    expect(stored.status).toBe("active");
    expect(stored.nodes).toEqual([]);
  });
});

// ── State isolation ───────────────────────────────────────────

describe("usePlanitStore — state isolation", () => {
  it("getState() reflects the latest value without re-render", () => {
    expect(usePlanitStore.getState().itinerary).toBeNull();
    usePlanitStore.getState().setItinerary(SAMPLE_ITINERARY);
    expect(usePlanitStore.getState().itinerary).not.toBeNull();
  });

  it("setState override works for test resets", () => {
    usePlanitStore.getState().setItinerary(SAMPLE_ITINERARY);
    usePlanitStore.setState({ itinerary: null });
    expect(usePlanitStore.getState().itinerary).toBeNull();
  });
});
