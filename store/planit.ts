"use client";

import { create } from "zustand";
import type { Itinerary, ChatResponse, TripSuggestions } from "@/types";

// ============================================================
// Planit Global Store
// Bridge between GlobalVoiceAssistant and DashboardPage.
//
// Voice writes here  →  Dashboard reacts.
// Dashboard writes here  →  Voice reads for context.
// ============================================================

// Actions the voice assistant can ask the dashboard to perform.
export type VoiceFlowAction =
  | { type: "build_all_activities" }      // select all suggestions and build
  | { type: "build_selected_activities" } // build with whatever is currently selected
  | { type: "add_food_ai" }               // let AI pick food for the itinerary
  | { type: "skip_food" };                // skip the food step

interface PlanitStore {
  // ── Context the voice reads ─────────────────────────────
  itinerary: Itinerary | null;
  userId: string;
  /** Activities available during the picking phase. Voice reads this to tell the
   *  user which options exist and to auto-select by name. */
  tripSuggestions: TripSuggestions | null;
  /** Which activity IDs the user has selected so far (mirrors dashboard state). */
  selectedActivityIds: Set<string>;

  // ── Signals from voice → dashboard ──────────────────────
  /** A full ChatResponse to hand off to dashboard's handleChatUpdate.
   *  Set by voice, cleared by dashboard after processing. */
  pendingChatResponse: ChatResponse | null;
  /** A discrete phase-transition command.
   *  Set by voice, cleared by dashboard after executing. */
  pendingVoiceAction: VoiceFlowAction | null;

  // ── Setters / dispatchers ────────────────────────────────
  setItinerary: (itinerary: Itinerary | null) => void;
  setTripSuggestions: (s: TripSuggestions | null) => void;
  setSelectedActivityIds: (ids: Set<string>) => void;
  dispatchChatResponse: (r: ChatResponse | null) => void;
  dispatchVoiceAction: (a: VoiceFlowAction | null) => void;
}

export const usePlanitStore = create<PlanitStore>()((set) => ({
  itinerary: null,
  userId: "00000000-0000-0000-0000-000000000001",
  tripSuggestions: null,
  selectedActivityIds: new Set(),
  pendingChatResponse: null,
  pendingVoiceAction: null,

  setItinerary: (itinerary) => set({ itinerary }),
  setTripSuggestions: (tripSuggestions) => set({ tripSuggestions }),
  setSelectedActivityIds: (selectedActivityIds) => set({ selectedActivityIds }),
  dispatchChatResponse: (pendingChatResponse) => set({ pendingChatResponse }),
  dispatchVoiceAction: (pendingVoiceAction) => set({ pendingVoiceAction }),
}));
