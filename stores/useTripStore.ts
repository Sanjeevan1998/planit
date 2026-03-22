'use client';

import { create } from 'zustand';
import type {
  KawaiiItinerary,
  KawaiiTripSuggestions,
  KawaiiFood,
  KawaiiConflict,
  KawaiiPivotAlert,
} from '@/types/kawaii';

export type PlanningStep = 'chat' | 'review' | 'customize' | 'finalize';

interface TripStore {
  itinerary: KawaiiItinerary | null;
  suggestions: KawaiiTripSuggestions | null;
  foodSuggestions: KawaiiFood[];
  conflicts: KawaiiConflict[];
  pivotAlert: KawaiiPivotAlert | null;
  selectedActivityIds: string[];
  selectedFoodIds: string[];
  planningStep: PlanningStep;
  setItinerary: (itinerary: KawaiiItinerary) => void;
  setSuggestions: (suggestions: KawaiiTripSuggestions) => void;
  setFoodSuggestions: (food: KawaiiFood[]) => void;
  setConflicts: (conflicts: KawaiiConflict[]) => void;
  setPivotAlert: (alert: KawaiiPivotAlert | null) => void;
  toggleActivitySelection: (id: string) => void;
  toggleFoodSelection: (id: string) => void;
  resolveConflict: (id: string) => void;
  setPlanningStep: (step: PlanningStep) => void;
  reset: () => void;
}

export const useTripStore = create<TripStore>((set) => ({
  itinerary: null,
  suggestions: null,
  foodSuggestions: [],
  conflicts: [],
  pivotAlert: null,
  selectedActivityIds: [],
  selectedFoodIds: [],
  planningStep: 'chat',
  setItinerary: (itinerary) => set({ itinerary }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setFoodSuggestions: (foodSuggestions) => set({ foodSuggestions }),
  setConflicts: (conflicts) => set({ conflicts }),
  setPivotAlert: (pivotAlert) => set({ pivotAlert }),
  toggleActivitySelection: (id) =>
    set((state) => ({
      selectedActivityIds: state.selectedActivityIds.includes(id)
        ? state.selectedActivityIds.filter((i) => i !== id)
        : [...state.selectedActivityIds, id],
    })),
  toggleFoodSelection: (id) =>
    set((state) => ({
      selectedFoodIds: state.selectedFoodIds.includes(id)
        ? state.selectedFoodIds.filter((i) => i !== id)
        : [...state.selectedFoodIds, id],
    })),
  resolveConflict: (id) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== id),
    })),
  setPlanningStep: (step) => set({ planningStep: step }),
  reset: () =>
    set({
      itinerary: null,
      suggestions: null,
      foodSuggestions: [],
      conflicts: [],
      pivotAlert: null,
      selectedActivityIds: [],
      selectedFoodIds: [],
      planningStep: 'chat',
    }),
}));
