import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { TransportOption, PlaceData, SearchResult, BookingLink } from "@/types";

// ============================================================
// PLANIT TOOLS — Used by LangGraph agents
// These are the "eyes and hands" of the Planit engine.
// ============================================================

// ----- Web Search Tool (Tavily) ----------------------------

export const tavilySearchTool = tool(
  async ({ query, max_results = 5 }: { query: string; max_results?: number }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY not set");

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results,
        search_depth: "advanced",
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!res.ok) {
      // Gracefully degrade — return empty results so the agent continues with Google Places
      console.warn(`[Tavily] Search unavailable (${res.status}): ${res.statusText}`);
      return { answer: null, results: [] };
    }
    const data = await res.json();

    // Plan limit exceeded or API error — degrade gracefully
    if (data.detail?.error || data.error) {
      console.warn("[Tavily] API error:", data.detail?.error || data.error);
      return { answer: null, results: [] };
    }

    const results: SearchResult[] = (data.results || []).map((r: Record<string, unknown>) => ({
      title: r.title as string,
      url: r.url as string,
      content: r.content as string,
      score: r.score as number | undefined,
      published_date: r.published_date as string | undefined,
    }));

    return { answer: data.answer, results };
  },
  {
    name: "tavily_search",
    description:
      "Search the web for real-time information about events, places, restaurants, or activities. Use for finding current events, menus, opening hours, and booking links.",
    schema: z.object({
      query: z.string().describe("The search query"),
      max_results: z.number().optional().default(5).describe("Maximum number of results"),
    }),
  }
);

// ----- Google Places Tool ----------------------------------

export const googlePlacesTool = tool(
  async ({
    query,
    location,
    radius_meters = 2000,
    type,
  }: {
    query: string;
    location?: { lat: number; lng: number };
    radius_meters?: number;
    type?: string;
  }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

    const params = new URLSearchParams({
      query,
      key: apiKey,
    });

    if (location) {
      params.append("location", `${location.lat},${location.lng}`);
      params.append("radius", radius_meters.toString());
    }
    if (type) params.append("type", type);

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
    );

    if (!res.ok) throw new Error(`Google Places failed: ${res.statusText}`);
    const data = await res.json();

    const places: PlaceData[] = (data.results || []).slice(0, 8).map((p: Record<string, unknown>) => {
      const geometry = p.geometry as { location: { lat: number; lng: number } } | undefined;
      const openingHours = p.opening_hours as { open_now?: boolean; weekday_text?: string[] } | undefined;
      const priceLevel = p.price_level as number | undefined;
      return {
        place_id: p.place_id as string,
        name: p.name as string,
        address: p.formatted_address as string,
        location: {
          lat: geometry?.location.lat ?? 0,
          lng: geometry?.location.lng ?? 0,
          address: p.formatted_address as string,
          place_id: p.place_id as string,
        },
        type: (p.types as string[]) || [],
        rating: p.rating as number | undefined,
        review_count: p.user_ratings_total as number | undefined,
        price_level: priceLevel,
        opening_hours: openingHours
          ? {
              open_now: openingHours.open_now ?? false,
              weekday_text: openingHours.weekday_text,
            }
          : undefined,
        photos: ((p.photos as Array<{ photo_reference: string }>) || [])
          .slice(0, 1)
          .map(
            (ph) =>
              `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ph.photo_reference}&key=${apiKey}`
          ),
      };
    });

    return { places };
  },
  {
    name: "google_places",
    description:
      "Search for places using Google Places API. Returns details including address, rating, opening hours, and accessibility info. Use for finding restaurants, hotels, attractions, and transit stops.",
    schema: z.object({
      query: z.string().describe("Place search query e.g. 'quiet coffee shop near Shinjuku Station'"),
      location: z
        .object({ lat: z.number(), lng: z.number() })
        .optional()
        .describe("Center point for nearby search"),
      radius_meters: z.number().optional().default(2000).describe("Search radius in meters"),
      type: z.string().optional().describe("Place type e.g. 'restaurant', 'lodging', 'museum'"),
    }),
  }
);

// ----- Google Place Details Tool ---------------------------

export const googlePlaceDetailsTool = tool(
  async ({ place_id }: { place_id: string }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

    const fields = [
      "name",
      "formatted_address",
      "geometry",
      "rating",
      "user_ratings_total",
      "price_level",
      "opening_hours",
      "website",
      "formatted_phone_number",
      "wheelchair_accessible_entrance",
      "photos",
    ].join(",");

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&key=${apiKey}`
    );

    if (!res.ok) throw new Error(`Google Place Details failed: ${res.statusText}`);
    const data = await res.json();
    return { details: data.result };
  },
  {
    name: "google_place_details",
    description: "Get detailed information about a specific place using its Google Place ID.",
    schema: z.object({
      place_id: z.string().describe("Google Places place_id"),
    }),
  }
);

// ----- Google Routes Tool ----------------------------------

export const googleRoutesTool = tool(
  async ({
    origin,
    destination,
    modes = ["TRANSIT", "DRIVE", "WALK"],
  }: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    modes?: string[];
  }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

    const routeResults: TransportOption[] = [];

    for (const mode of modes) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?` +
            new URLSearchParams({
              origin: `${origin.lat},${origin.lng}`,
              destination: `${destination.lat},${destination.lng}`,
              mode: mode.toLowerCase(),
              key: apiKey,
              alternatives: "true",
            })
        );

        if (!res.ok) continue;
        const data = await res.json();
        if (!data.routes?.length) continue;

        const route = data.routes[0];
        const leg = route.legs[0];

        const modeMap: Record<string, TransportOption["mode"]> = {
          TRANSIT: "train",
          DRIVE: "taxi",
          WALK: "walk",
          BICYCLING: "bike",
        };

        const tagMap: Record<string, TransportOption["tags"]> = {
          WALK: ["cheapest"],
          TRANSIT: ["most_accessible"],
          DRIVE: ["fastest"],
          BICYCLING: ["eco"],
        };

        routeResults.push({
          mode: modeMap[mode] || "walk",
          label: `${mode} via ${leg.start_address}`,
          duration_minutes: Math.round(leg.duration.value / 60),
          cost_estimate:
            mode === "WALK" ? "Free" : mode === "TRANSIT" ? "~¥200–500" : "~¥1,500+",
          booking_link:
            mode === "DRIVE"
              ? {
                  platform: "Uber",
                  url: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${destination.lat}&dropoff[longitude]=${destination.lng}`,
                  label: "Order Uber",
                  category: "transport",
                }
              : undefined,
          tags: tagMap[mode] || [],
          steps: leg.steps?.slice(0, 5).map((s: Record<string, unknown>) => {
            const htmlInstructions = s.html_instructions as string | undefined;
            return htmlInstructions?.replace(/<[^>]*>/g, "") ?? "";
          }),
        });
      } catch {
        // Skip failed modes gracefully
      }
    }

    return { transport_options: routeResults };
  },
  {
    name: "google_routes",
    description:
      "Get transport options between two locations. Returns walking, transit, and driving routes with duration, cost, and accessibility notes.",
    schema: z.object({
      origin: z.object({ lat: z.number(), lng: z.number() }).describe("Origin coordinates"),
      destination: z
        .object({ lat: z.number(), lng: z.number() })
        .describe("Destination coordinates"),
      modes: z
        .array(z.string())
        .optional()
        .default(["TRANSIT", "DRIVE", "WALK"])
        .describe("Transport modes to calculate"),
    }),
  }
);

// ----- Weather Tool ----------------------------------------

export const weatherTool = tool(
  async ({ lat, lng }: { lat: number; lng: number }) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) throw new Error("OPENWEATHER_API_KEY not set");

    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`
    );

    if (!res.ok) throw new Error(`Weather fetch failed: ${res.statusText}`);
    const data = await res.json();

    const weatherMap: Record<string, string> = {
      Clear: "sunny",
      Clouds: "cloudy",
      Rain: "rainy",
      Drizzle: "rainy",
      Thunderstorm: "stormy",
      Snow: "snowy",
      Mist: "cloudy",
      Fog: "cloudy",
    };

    return {
      condition: weatherMap[data.weather[0].main] || "cloudy",
      temperature_celsius: Math.round(data.main.temp),
      description: data.weather[0].description,
      icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
      timestamp: new Date().toISOString(),
    };
  },
  {
    name: "get_weather",
    description: "Get current weather for a location by coordinates.",
    schema: z.object({
      lat: z.number().describe("Latitude"),
      lng: z.number().describe("Longitude"),
    }),
  }
);

// ----- Booking Link Generator Tool -------------------------

export const bookingLinkTool = tool(
  async ({
    place_name,
    place_address,
    category,
    coordinates,
  }: {
    place_name: string;
    place_address?: string;
    category: "hotel" | "restaurant" | "activity" | "transport" | "event";
    coordinates?: { lat: number; lng: number };
  }) => {
    const encodedName = encodeURIComponent(place_name);
    const encodedAddress = encodeURIComponent(place_address || place_name);

    const links: BookingLink[] = [];

    if (category === "hotel") {
      links.push(
        {
          platform: "Booking.com",
          url: `https://www.booking.com/searchresults.html?ss=${encodedName}`,
          label: "Book on Booking.com",
          category: "hotel",
        },
        {
          platform: "Expedia",
          url: `https://www.expedia.com/Hotels?destination=${encodedName}`,
          label: "Book on Expedia",
          category: "hotel",
        }
      );
    }

    if (category === "restaurant") {
      links.push(
        {
          platform: "Google Maps",
          url: `https://www.google.com/maps/search/${encodedName}`,
          label: "View on Google Maps",
          category: "restaurant",
        },
        {
          platform: "Tabelog",
          url: `https://tabelog.com/en/tokyo/`,
          label: "Check on Tabelog",
          category: "restaurant",
        }
      );
    }

    if (category === "activity" || category === "event") {
      links.push(
        {
          platform: "Viator",
          url: `https://www.viator.com/searchResults/all?text=${encodedName}`,
          label: "Book on Viator",
          category: "activity",
        },
        {
          platform: "GetYourGuide",
          url: `https://www.getyourguide.com/s/?q=${encodedName}`,
          label: "Book on GetYourGuide",
          category: "activity",
        }
      );
    }

    if (category === "transport" && coordinates) {
      links.push({
        platform: "Uber",
        url: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${coordinates.lat}&dropoff[longitude]=${coordinates.lng}&dropoff[nickname]=${encodedName}`,
        label: "Order Uber",
        category: "transport",
      });
      links.push({
        platform: "Google Maps",
        url: `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}&travelmode=transit`,
        label: "Navigate via Google Maps",
        category: "transport",
      });
    }

    // Always add Google Maps as fallback
    links.push({
      platform: "Google Maps",
      url: `https://www.google.com/maps/search/${encodedAddress}`,
      label: "View on Google Maps",
      category,
    });

    return { booking_links: links };
  },
  {
    name: "generate_booking_links",
    description:
      "Generate direct booking links for hotels, restaurants, activities, or transport. Returns categorized deep links to booking platforms.",
    schema: z.object({
      place_name: z.string().describe("Name of the place"),
      place_address: z.string().optional().describe("Address of the place"),
      category: z
        .enum(["hotel", "restaurant", "activity", "transport", "event"])
        .describe("Type of place"),
      coordinates: z
        .object({ lat: z.number(), lng: z.number() })
        .optional()
        .describe("Coordinates for transport links"),
    }),
  }
);

export const ALL_TOOLS = [
  tavilySearchTool,
  googlePlacesTool,
  googlePlaceDetailsTool,
  googleRoutesTool,
  weatherTool,
  bookingLinkTool,
];
