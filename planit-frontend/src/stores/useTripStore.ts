import { create } from 'zustand';
import { Itinerary, Conflict, FoodSuggestion, PivotAlert } from '@/types/trip';

export type PlanningStep = "chat" | "review" | "customize" | "finalize";

interface TripStore {
  itinerary: Itinerary | null;
  suggestions: any | null;
  foodSuggestions: FoodSuggestion[];
  conflicts: Conflict[];
  pivotAlert: PivotAlert | null;
  selectedActivityIds: string[];
  selectedFoodIds: string[];
  planningStep: PlanningStep;
  setItinerary: (itinerary: Itinerary) => void;
  setSuggestions: (suggestions: any) => void;
  setFoodSuggestions: (food: FoodSuggestion[]) => void;
  setConflicts: (conflicts: Conflict[]) => void;
  setPivotAlert: (alert: PivotAlert | null) => void;
  toggleActivitySelection: (id: string) => void;
  toggleFoodSelection: (id: string) => void;
  resolveConflict: (id: string) => void;
  setPlanningStep: (step: PlanningStep) => void;
}

export const useTripStore = create<TripStore>((set) => ({
  itinerary: null,
  suggestions: null,
  foodSuggestions: [],
  conflicts: [],
  pivotAlert: null,
  selectedActivityIds: [],
  selectedFoodIds: [],
  planningStep: "chat",
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
}));
