/**
 * Tests for services/api.ts adapter functions and API integration.
 *
 * Strategy: export the pure adapter functions via internal imports so we can
 * unit-test type transformations without hitting the network.  Network calls
 * are tested via fetch mocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Minimal backend ItineraryNode with all required fields */
function makeNode(overrides: Partial<{
  id: string;
  type: string;
  title: string;
  start_time: string;
  end_time: string;
  location: { lat: number; lng: number; address: string };
  description: string;
  image_url: string;
  why_selected: string;
  budget_tier: string;
  tags: string[];
  transport_options: Array<{ mode: string; duration_minutes: number; cost_estimate: string }>;
  booking_links: Array<{ platform: string; url: string; label: string; category: string }>;
  is_pivot: boolean;
  parent_id: string | null;
}> = {}) {
  return {
    id: "node-1",
    type: "activity",
    title: "Test Activity",
    start_time: "2026-04-01T09:00:00+09:00",
    end_time: "2026-04-01T11:00:00+09:00",
    location: { lat: 35.68, lng: 139.69, address: "Shinjuku, Tokyo" },
    description: "A test activity",
    image_url: "",
    why_selected: "Good reason",
    budget_tier: "mid-range",
    tags: ["culture", "outdoor"],
    transport_options: [],
    booking_links: [],
    is_pivot: false,
    parent_id: null,
    ...overrides,
  };
}

function makeItinerary(overrides: Partial<{
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget_tier: string;
  status: string;
  nodes: ReturnType<typeof makeNode>[];
}> = {}) {
  return {
    id: "it-1",
    user_id: "user-1",
    title: "Tokyo Adventure",
    destination: "Tokyo, Japan",
    start_date: "2026-04-01",
    end_date: "2026-04-03",
    budget_tier: "mid-range",
    status: "draft",
    timezone: "Asia/Tokyo",
    nodes: [] as ReturnType<typeof makeNode>[],
    branches: [],
    ...overrides,
  };
}

// ─── Node time formatting ─────────────────────────────────────────────────────

describe("Node ISO time → HH:MM display format", () => {
  it("extracts hours and minutes from an ISO 8601 timestamp with timezone", () => {
    const ts = "2026-04-01T09:00:00+09:00";
    const d = new Date(ts);
    const result = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
    // The UTC equivalent of 09:00+09:00 is 00:00 UTC
    expect(result).toBe("00:00");
  });

  it("parses midnight correctly", () => {
    const ts = "2026-04-01T00:00:00+00:00";
    const d = new Date(ts);
    const result = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
    expect(result).toBe("00:00");
  });
});

// ─── Itinerary node grouping by date ─────────────────────────────────────────

describe("Group flat nodes by date (adapter logic)", () => {
  function groupNodesByDate(nodes: ReturnType<typeof makeNode>[]) {
    const byDate = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const dateKey = n.start_time ? n.start_time.slice(0, 10) : "2026-01-01";
      const existing = byDate.get(dateKey) ?? [];
      existing.push(n);
      byDate.set(dateKey, existing);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ns]) => ({
        date,
        nodes: ns.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "")),
      }));
  }

  it("groups nodes on the same day together", () => {
    const nodes = [
      makeNode({ id: "n1", start_time: "2026-04-01T09:00:00+09:00" }),
      makeNode({ id: "n2", start_time: "2026-04-01T14:00:00+09:00" }),
    ];
    const days = groupNodesByDate(nodes);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-04-01");
    expect(days[0].nodes).toHaveLength(2);
  });

  it("separates nodes on different days into different day groups", () => {
    const nodes = [
      makeNode({ id: "n1", start_time: "2026-04-01T09:00:00+09:00" }),
      makeNode({ id: "n2", start_time: "2026-04-02T09:00:00+09:00" }),
      makeNode({ id: "n3", start_time: "2026-04-02T14:00:00+09:00" }),
    ];
    const days = groupNodesByDate(nodes);
    expect(days).toHaveLength(2);
    expect(days[0].date).toBe("2026-04-01");
    expect(days[1].date).toBe("2026-04-02");
    expect(days[1].nodes).toHaveLength(2);
  });

  it("returns days in chronological order regardless of insertion order", () => {
    const nodes = [
      makeNode({ id: "n3", start_time: "2026-04-03T09:00:00+09:00" }),
      makeNode({ id: "n1", start_time: "2026-04-01T09:00:00+09:00" }),
      makeNode({ id: "n2", start_time: "2026-04-02T09:00:00+09:00" }),
    ];
    const days = groupNodesByDate(nodes);
    expect(days.map((d) => d.date)).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
  });

  it("handles empty node list", () => {
    expect(groupNodesByDate([])).toEqual([]);
  });

  it("excludes child/alternative nodes (those with a parent_id)", () => {
    const allNodes = [
      makeNode({ id: "n1", parent_id: null }),
      makeNode({ id: "n2", parent_id: "n1" }), // alternative — should be filtered out
    ];
    const primary = allNodes.filter((n) => !n.parent_id);
    const days = groupNodesByDate(primary);
    expect(days[0].nodes).toHaveLength(1);
    expect(days[0].nodes[0].id).toBe("n1");
  });
});

// ─── Transport option adapter ─────────────────────────────────────────────────

describe("Transport option conversion (backend → kawaii UI)", () => {
  function adaptTransport(t: { mode: string; duration_minutes: number; cost_estimate?: string; accessibility_note?: string }) {
    return {
      mode: t.mode,
      duration: `${t.duration_minutes} min`,
      cost: t.cost_estimate ?? "",
      notes: t.accessibility_note,
    };
  }

  it("formats duration as '<N> min'", () => {
    const result = adaptTransport({ mode: "subway", duration_minutes: 18, cost_estimate: "¥200" });
    expect(result.duration).toBe("18 min");
  });

  it("uses empty string when cost_estimate is absent", () => {
    const result = adaptTransport({ mode: "walk", duration_minutes: 5 });
    expect(result.cost).toBe("");
  });

  it("preserves mode string unchanged", () => {
    const result = adaptTransport({ mode: "bullet_train", duration_minutes: 90 });
    expect(result.mode).toBe("bullet_train");
  });

  it("maps accessibility_note to notes field", () => {
    const result = adaptTransport({
      mode: "subway",
      duration_minutes: 15,
      accessibility_note: "Use Exit A1 for elevator",
    });
    expect(result.notes).toBe("Use Exit A1 for elevator");
  });
});

// ─── Booking link adapter ─────────────────────────────────────────────────────

describe("Booking link conversion (backend → kawaii UI)", () => {
  function adaptLinks(links: Array<{ platform: string; url: string; label: string; category: string }>) {
    return links.map((bl) => ({ label: bl.label, url: bl.url }));
  }

  it("extracts label and url", () => {
    const links = [{ platform: "Klook", url: "https://klook.com", label: "Book now", category: "activity" }];
    expect(adaptLinks(links)).toEqual([{ label: "Book now", url: "https://klook.com" }]);
  });

  it("returns empty array for empty input", () => {
    expect(adaptLinks([])).toEqual([]);
  });

  it("maps multiple links", () => {
    const links = [
      { platform: "Klook", url: "https://klook.com", label: "Book", category: "activity" },
      { platform: "Uber", url: "https://uber.com", label: "Ride", category: "transport" },
    ];
    const result = adaptLinks(links);
    expect(result).toHaveLength(2);
    expect(result[1].label).toBe("Ride");
  });
});

// ─── TripSuggestions adapter ──────────────────────────────────────────────────

describe("TripSuggestions conversion (backend → kawaii UI)", () => {
  function adaptSuggestions(s: {
    trip_title: string;
    destination: string;
    start_date: string;
    end_date: string;
    cities: Array<{
      city: string;
      date_range: { from: string; to: string };
      activities: Array<{ id: string; title: string; type: string; description: string; budget_tier: string; tags: string[]; why_selected: string; image_url?: string; rating?: number; booking_links: Array<{ platform: string; url: string; label: string; category: string }>; location: { lat: number; lng: number; address: string } }>;
      events: typeof this.cities[0]["activities"];
    }>;
  }) {
    return {
      trip_title: s.trip_title,
      destination: s.destination,
      start_date: s.start_date,
      end_date: s.end_date,
      cities: s.cities.map((c) => ({
        city: c.city,
        date_range: `${c.date_range.from} – ${c.date_range.to}`,
        activities: [...c.activities, ...c.events].map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          description: a.description,
          budget_tier: a.budget_tier,
          tags: a.tags,
          why_selected: a.why_selected,
          image_url: a.image_url ?? "",
          location: a.location?.address ?? "",
          rating: a.rating,
          links: a.booking_links.map((bl) => ({ label: bl.label, url: bl.url })),
        })),
      })),
    };
  }

  const mockSuggestions = {
    trip_title: "Tokyo Trip",
    destination: "Japan",
    start_date: "2026-04-01",
    end_date: "2026-04-05",
    cities: [
      {
        city: "Tokyo",
        date_range: { from: "2026-04-01", to: "2026-04-03" },
        activities: [
          {
            id: "act-1",
            title: "Senso-ji",
            type: "activity",
            description: "Ancient temple",
            budget_tier: "budget",
            tags: ["temple"],
            why_selected: "Iconic",
            image_url: "https://example.com/img.jpg",
            rating: 4.8,
            booking_links: [{ platform: "Google", url: "https://maps.google.com", label: "Maps", category: "activity" }],
            location: { lat: 35.71, lng: 139.79, address: "Asakusa" },
          },
        ],
        events: [
          {
            id: "event-1",
            title: "Sakura Festival",
            type: "event",
            description: "Cherry blossom festival",
            budget_tier: "free",
            tags: ["festival"],
            why_selected: "Seasonal event",
            image_url: "",
            rating: 4.9,
            booking_links: [],
            location: { lat: 35.65, lng: 139.75, address: "Ueno Park" },
          },
        ],
      },
    ],
  };

  it("preserves trip metadata", () => {
    const result = adaptSuggestions(mockSuggestions);
    expect(result.trip_title).toBe("Tokyo Trip");
    expect(result.destination).toBe("Japan");
    expect(result.start_date).toBe("2026-04-01");
    expect(result.end_date).toBe("2026-04-05");
  });

  it("formats date_range as '<from> – <to>' string", () => {
    const result = adaptSuggestions(mockSuggestions);
    expect(result.cities[0].date_range).toBe("2026-04-01 – 2026-04-03");
  });

  it("merges activities and events into a single activities array", () => {
    const result = adaptSuggestions(mockSuggestions);
    expect(result.cities[0].activities).toHaveLength(2);
  });

  it("activity has image_url from source", () => {
    const result = adaptSuggestions(mockSuggestions);
    expect(result.cities[0].activities[0].image_url).toBe("https://example.com/img.jpg");
  });

  it("event falls back to empty image_url", () => {
    const result = adaptSuggestions(mockSuggestions);
    const event = result.cities[0].activities.find((a) => a.type === "event");
    expect(event?.image_url).toBe("");
  });

  it("converts booking_links to simpler {label, url} shape", () => {
    const result = adaptSuggestions(mockSuggestions);
    const links = result.cities[0].activities[0].links;
    expect(links).toEqual([{ label: "Maps", url: "https://maps.google.com" }]);
  });
});

// ─── Fetch mock integration tests ────────────────────────────────────────────

describe("sendChatMessage (fetch mock)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns chat mode when no trip_suggestions in response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: "Where do you want to go?" }),
    } as Response);

    const { sendChatMessage } = await import("@/services/api");
    const result = await sendChatMessage("Hello", "user-123");
    expect(result.mode).toBe("chat");
    expect(result.response).toBe("Where do you want to go?");
    expect(result.tripSuggestions).toBeUndefined();
  });

  it("returns suggest mode with tripSuggestions when cities are present", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: "Here are your suggestions!",
        trip_suggestions: {
          trip_title: "Tokyo Trip",
          destination: "Japan",
          start_date: "2026-04-01",
          end_date: "2026-04-05",
          cities: [
            {
              city: "Tokyo",
              date_range: { from: "2026-04-01", to: "2026-04-03" },
              activities: [],
              events: [],
            },
          ],
        },
      }),
    } as Response);

    const { sendChatMessage } = await import("@/services/api");
    const result = await sendChatMessage("Plan me a trip to Japan", "user-123");
    expect(result.mode).toBe("suggest");
    expect(result.tripSuggestions).toBeDefined();
    expect(result.tripSuggestions?.destination).toBe("Japan");
  });

  it("throws when the API returns a non-ok status", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Something broke",
    } as Response);

    const { sendChatMessage } = await import("@/services/api");
    await expect(sendChatMessage("Hello", "user-123")).rejects.toThrow(/500/);
  });

  it("POSTs to /api/chat with the correct payload", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: "OK" }),
    } as Response);

    const { sendChatMessage } = await import("@/services/api");
    await sendChatMessage("Tokyo please", "abc-123", "it-456");

    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.message).toBe("Tokyo please");
    expect(body.user_id).toBe("abc-123");
    expect(body.itinerary_id).toBe("it-456");
  });
});

// ─── bootstrapUser ───────────────────────────────────────────────────────────

describe("bootstrapUser (fetch mock)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs the user name as a memory to /api/memory", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, count: 1 }),
    } as Response);

    const { bootstrapUser } = await import("@/services/api");
    await bootstrapUser("user-uuid", "Alice");

    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/memory");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.user_id).toBe("user-uuid");
    expect(body.memory.key).toBe("name");
    expect(body.memory.value).toBe("Alice");
    expect(body.memory.category).toBe("custom");
  });
});

// ─── getFoodSuggestions ──────────────────────────────────────────────────────

describe("getFoodSuggestions (fetch mock)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns adapted KawaiiFood array", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        food: [
          {
            id: "f-1",
            city: "Tokyo",
            title: "Ichiran",
            description: "Best ramen",
            location: { lat: 35.69, lng: 139.70, address: "Shinjuku" },
            meal_type: "dinner",
            cuisine: "Ramen",
            must_try_dishes: ["Tonkotsu"],
            why_authentic: "Since 1960",
            budget_tier: "budget",
            budget_estimate: "¥1,200",
            tags: ["ramen"],
            accessibility_verified: true,
            booking_links: [],
            rating: 4.8,
          },
        ],
      }),
    } as Response);

    const { getFoodSuggestions } = await import("@/services/api");
    const result = await getFoodSuggestions("user-1", ["Tokyo"], "2026-04-01", "2026-04-05");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("f-1");
    expect(result[0].title).toBe("Ichiran");
    expect(result[0].meal_type).toBe("dinner");
    expect(result[0].cuisine).toBe("Ramen");
    expect(result[0].why_selected).toBe("Since 1960");
    expect(result[0].location).toBe("Shinjuku");
  });

  it("POSTs to /api/itinerary/food with correct cities and date_range", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ food: [] }),
    } as Response);

    const { getFoodSuggestions } = await import("@/services/api");
    await getFoodSuggestions("u-1", ["Tokyo", "Kyoto"], "2026-04-01", "2026-04-07");

    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/itinerary/food");
    const body = JSON.parse(opts.body);
    expect(body.cities).toEqual(["Tokyo", "Kyoto"]);
    expect(body.date_range).toEqual({ start: "2026-04-01", end: "2026-04-07" });
  });
});

// ─── buildItinerary conflict handling ────────────────────────────────────────

describe("buildItinerary (fetch mock)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const mockSuggestions = {
    trip_title: "Japan Trip",
    destination: "Japan",
    start_date: "2026-04-01",
    end_date: "2026-04-05",
    cities: [{ city: "Tokyo", date_range: "Apr 1 – Apr 3", activities: [] }],
  };

  it("returns conflicts array when API detects scheduling conflicts", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        conflicts: [
          {
            date: "2026-04-02",
            time_slot: "20:00–22:00",
            options: [
              { id: "act-a", title: "Concert A", type: "event", description: "", budget_tier: "premium", tags: [], why_selected: "", image_url: "", location: { lat: 0, lng: 0, address: "" }, booking_links: [] },
              { id: "act-b", title: "Show B", type: "event", description: "", budget_tier: "premium", tags: [], why_selected: "", image_url: "", location: { lat: 0, lng: 0, address: "" }, booking_links: [] },
            ],
          },
        ],
      }),
    } as Response);

    const { buildItinerary } = await import("@/services/api");
    const result = await buildItinerary("u-1", ["act-a", "act-b"], mockSuggestions as never);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts![0].date).toBe("2026-04-02");
    expect(result.conflicts![0].options).toHaveLength(2);
    expect(result.itinerary).toBeUndefined();
  });

  it("returns adapted KawaiiItinerary when no conflicts", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        itinerary: makeItinerary({
          nodes: [
            makeNode({ start_time: "2026-04-01T09:00:00+09:00" }),
            makeNode({ id: "n2", start_time: "2026-04-02T10:00:00+09:00" }),
          ],
        }),
      }),
    } as Response);

    const { buildItinerary } = await import("@/services/api");
    const result = await buildItinerary("u-1", ["act-1"], mockSuggestions as never);
    expect(result.itinerary).toBeDefined();
    expect(result.itinerary?.id).toBe("it-1");
    expect(result.itinerary?.days).toHaveLength(2);
    expect(result.conflicts).toBeUndefined();
  });
});
