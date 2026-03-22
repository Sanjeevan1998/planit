import { TripSuggestions, Itinerary } from '@/types/trip';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const chatFlows = [
  {
    keywords: ['hello', 'hi', 'hey', 'start', 'plan'],
    response: "Hey there! 🌸 I'd love to help you plan an amazing trip. Where are you dreaming of going?",
  },
  {
    keywords: ['japan', 'tokyo', 'kyoto', 'osaka'],
    response: "Japan is magical! 🏯✨ Cherry blossoms, incredible food, ancient temples... How many days are you thinking? And what's your vibe — adventure, relaxation, foodie tour, or a mix of everything?",
  },
  {
    keywords: ['europe', 'paris', 'rome', 'italy', 'france', 'spain'],
    response: "Europe is calling! 🗼 So many beautiful cities to explore. How long is your trip? And are you more into history & culture, food & nightlife, or nature & adventure?",
  },
  {
    keywords: ['days', 'week', 'budget', 'vibe', 'mix', 'adventure', 'food', 'relax'],
    response: "Perfect! Let me think about the ideal itinerary for you... 🗺️✨ I'm putting together some amazing activities and hidden gems. Give me just a moment!",
    triggerSuggestions: true,
  },
];

const defaultResponse = "That sounds wonderful! ✨ Tell me more — where do you want to go, how many days, and what kind of experiences are you looking for? (adventure, foodie, relaxation, culture...)";

export async function sendChatMessage(message: string, userId: string): Promise<{
  response: string;
  mode: 'chat' | 'suggest';
  tripSuggestions?: TripSuggestions;
}> {
  await delay(1200 + Math.random() * 800);

  const lower = message.toLowerCase();
  const matched = chatFlows.find(f => f.keywords.some(k => lower.includes(k)));

  if (matched?.triggerSuggestions) {
    await delay(1500);
    return {
      response: matched.response,
      mode: 'suggest',
      tripSuggestions: getMockSuggestions(),
    };
  }

  return {
    response: matched?.response || defaultResponse,
    mode: 'chat',
  };
}

function getMockSuggestions(): TripSuggestions {
  return {
    trip_title: "Enchanted Japan Adventure",
    destination: "Japan",
    start_date: "2026-04-10",
    end_date: "2026-04-17",
    cities: [
      {
        city: "Tokyo",
        date_range: "Apr 10 – Apr 13",
        activities: [
          {
            id: "act-1",
            type: "sightseeing",
            title: "Shibuya Crossing & Harajuku",
            description: "Experience the iconic scramble crossing then explore Harajuku's quirky fashion street and Meiji Shrine.",
            budget_tier: "free",
            tags: ["culture", "walking", "iconic"],
            why_selected: "The quintessential Tokyo experience — vibrant, photogenic, and free!",
            image_url: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=600&q=80",
            location: "Shibuya, Tokyo",
            rating: 4.8,
            links: [{ label: "Google Maps", url: "#" }, { label: "Travel Guide", url: "#" }],
          },
          {
            id: "act-2",
            type: "food",
            title: "Tsukiji Outer Market Food Tour",
            description: "Sample fresh sushi, tamagoyaki, and matcha treats at the legendary market.",
            budget_tier: "moderate",
            tags: ["foodie", "local", "morning"],
            why_selected: "Best street food in Tokyo — you'll taste things you've never imagined.",
            image_url: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=600&q=80",
            location: "Tsukiji, Tokyo",
            rating: 4.7,
            links: [{ label: "Book Tour", url: "#" }],
          },
          {
            id: "act-3",
            type: "experience",
            title: "TeamLab Borderless",
            description: "Immerse yourself in stunning digital art installations that respond to your movement.",
            budget_tier: "moderate",
            tags: ["art", "unique", "instagram"],
            why_selected: "A one-of-a-kind sensory experience you can't get anywhere else.",
            image_url: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&q=80",
            location: "Odaiba, Tokyo",
            rating: 4.9,
            links: [{ label: "Buy Tickets", url: "#" }],
          },
          {
            id: "act-4",
            type: "nightlife",
            title: "Golden Gai Bar Hopping",
            description: "Tiny bars with big personality in Shinjuku's legendary alley district.",
            budget_tier: "moderate",
            tags: ["nightlife", "local", "cozy"],
            why_selected: "Each bar seats 6-8 people — intimate and unforgettable.",
            image_url: "https://images.unsplash.com/photo-1554797589-7241bb691973?w=600&q=80",
            location: "Shinjuku, Tokyo",
            rating: 4.6,
            links: [{ label: "Bar Guide", url: "#" }],
          },
        ],
      },
      {
        city: "Kyoto",
        date_range: "Apr 14 – Apr 17",
        activities: [
          {
            id: "act-5",
            type: "sightseeing",
            title: "Fushimi Inari Shrine",
            description: "Walk through thousands of vermillion torii gates winding up the sacred mountain.",
            budget_tier: "free",
            tags: ["spiritual", "hiking", "iconic"],
            why_selected: "The most photographed spot in Japan — especially magical at dawn.",
            image_url: "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=600&q=80",
            location: "Fushimi, Kyoto",
            rating: 4.9,
            links: [{ label: "Visitor Info", url: "#" }],
          },
          {
            id: "act-6",
            type: "experience",
            title: "Traditional Tea Ceremony",
            description: "Learn the art of matcha preparation in a 200-year-old tea house.",
            budget_tier: "premium",
            tags: ["culture", "relaxing", "authentic"],
            why_selected: "A meditative experience that connects you to centuries of tradition.",
            image_url: "https://images.unsplash.com/photo-1545048702-79362596cdc9?w=600&q=80",
            location: "Gion, Kyoto",
            rating: 4.8,
            links: [{ label: "Book Experience", url: "#" }],
          },
          {
            id: "act-7",
            type: "nature",
            title: "Arashiyama Bamboo Grove",
            description: "Stroll through towering bamboo stalks in this ethereal forest path.",
            budget_tier: "free",
            tags: ["nature", "peaceful", "photogenic"],
            why_selected: "The sound of wind through bamboo is pure zen.",
            image_url: "https://images.unsplash.com/photo-1528164344705-47542687000d?w=600&q=80",
            location: "Arashiyama, Kyoto",
            rating: 4.7,
            links: [{ label: "Google Maps", url: "#" }],
          },
          {
            id: "act-8",
            type: "food",
            title: "Nishiki Market & Kaiseki Dinner",
            description: "Browse 'Kyoto's Kitchen' then enjoy a multi-course kaiseki dinner.",
            budget_tier: "premium",
            tags: ["foodie", "gourmet", "evening"],
            why_selected: "Kaiseki is edible art — the pinnacle of Japanese cuisine.",
            image_url: "https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=600&q=80",
            location: "Nakagyo, Kyoto",
            rating: 4.9,
            links: [{ label: "Book Restaurant", url: "#" }],
          },
        ],
      },
    ],
  };
}

export function buildItineraryFromSelections(
  suggestions: TripSuggestions,
  selectedIds: string[]
): Itinerary {
  const selectedActivities = suggestions.cities.flatMap(c =>
    c.activities.filter(a => selectedIds.includes(a.id)).map(a => ({ ...a, cityDateRange: c.date_range, city: c.city }))
  );

  const dayMap = new Map<string, typeof selectedActivities>();
  for (const act of selectedActivities) {
    const existing = dayMap.get(act.city) || [];
    existing.push(act);
    dayMap.set(act.city, existing);
  }

  const days = Array.from(dayMap.entries()).map(([city, acts], dayIdx) => ({
    date: `2026-04-${10 + dayIdx * 2}`,
    label: `${city} — ${acts[0]?.cityDateRange || ''}`,
    nodes: acts.map((a, i) => ({
      id: a.id,
      type: (a.type === 'food' ? 'meal' : 'activity') as 'activity' | 'meal',
      title: a.title,
      start_time: `${9 + i * 3}:00`,
      end_time: `${11 + i * 3}:00`,
      location: a.location || city,
      description: a.description,
      image_url: a.image_url,
      why_selected: a.why_selected,
      budget_tier: a.budget_tier,
      tags: a.tags,
      links: a.links,
      transport_options: i > 0 ? [
        { mode: 'Train', duration: '15 min', cost: '¥200' },
        { mode: 'Taxi', duration: '8 min', cost: '¥1,200' },
      ] : undefined,
    })),
  }));

  return {
    id: 'itin-1',
    title: suggestions.trip_title,
    destination: suggestions.destination,
    start_date: suggestions.start_date,
    end_date: suggestions.end_date,
    budget_tier: 'moderate',
    days,
  };
}
