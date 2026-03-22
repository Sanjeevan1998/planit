"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Map,
  MessageSquare,
  Accessibility,
  DollarSign,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  ListChecks,
  X,
  Brain,
} from "lucide-react";
import { BranchingTimeline } from "@/components/itinerary/BranchingTimeline";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { AccessibilityPanel } from "@/components/accessibility/AccessibilityPanel";
import { BudgetSlider } from "@/components/itinerary/BudgetSlider";
import { TransportPanel } from "@/components/itinerary/TransportPanel";
import { ActivityPicker } from "@/components/planning/ActivityPicker";
import { ConflictResolver } from "@/components/planning/ConflictResolver";
import { FoodAskStep, FoodPicker } from "@/components/planning/FoodStep";
import { BuildingSpinner } from "@/components/planning/BuildingSpinner";
import { PlanningSteps } from "@/components/planning/PlanningSteps";
import { MemoryPanel } from "@/components/settings/MemoryPanel";
import { cn } from "@/lib/utils";
import type {
  Itinerary,
  AccessibilityPreferences,
  BudgetTier,
  ChatResponse,
  TransportOption,
  TripSuggestions,
  FoodSuggestion,
  ActivityConflict,
} from "@/types";
import toast from "react-hot-toast";

// ============================================================
// Dashboard — The main Planit experience
// Left: Chat + Voice | Center: Multi-step or Timeline | Right: Panels
// ============================================================

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm flex items-center justify-center z-20">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-zinc-200">{message}</p>
        <p className="text-xs text-zinc-500 mt-1">This may take a moment</p>
      </div>
    </div>
  );
}

type SidePanel = "accessibility" | "budget" | "transport" | "memory" | null;

// Multi-step planning flow
type FlowStep =
  | "idle"          // no active flow — shows itinerary or empty state
  | "suggesting"    // fetching suggestions (spinner)
  | "picking"       // user picks activities (ActivityPicker)
  | "building"      // building itinerary (spinner)
  | "conflict"      // conflict resolver
  | "food_ask"      // food decision step
  | "food_pick"     // user picks specific food
  | "adding_food"   // adding food to itinerary (spinner)
  | "done";         // shows final itinerary

export default function DashboardPage() {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [isLoadingItinerary, setIsLoadingItinerary] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [activeTab, setActiveTab] = useState<"timeline" | "chat">("chat");
  const [isMobile, setIsMobile] = useState(false);

  // Selection mode (customize existing itinerary)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFinalizing, setIsFinalizing] = useState(false);

  // ── Multi-step flow state ───────────────────────────────────
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [tripSuggestions, setTripSuggestions] = useState<TripSuggestions | null>(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  const [pendingConflicts, setPendingConflicts] = useState<ActivityConflict[]>([]);
  const [pendingItineraryId, setPendingItineraryId] = useState<string | null>(null);
  const [foodSuggestions, setFoodSuggestions] = useState<FoodSuggestion[]>([]);
  const [selectedFoodIds, setSelectedFoodIds] = useState<Set<string>>(new Set());
  // Which screen triggered the build: "picker" stays on ActivityPicker, "conflict" stays on ConflictResolver
  const [buildSource, setBuildSource] = useState<"picker" | "conflict">("picker");
  // Which screen to keep visible while adding_food: "ask" = FoodAskStep, "pick" = FoodPicker
  const [foodAddSource, setFoodAddSource] = useState<"ask" | "pick">("ask");
  // Immediate loading state for the food ask step (fetching suggestions or adding)
  const [isFoodFetching, setIsFoodFetching] = useState(false);
  // Loading overlay message (shown on top of the current screen during long ops)
  const [loadingOverlayMsg, setLoadingOverlayMsg] = useState<string | null>(null);

  const [accessPrefs, setAccessPrefs] = useState<Partial<AccessibilityPreferences>>({
    requires_elevator: false,
    low_sensory: false,
    uses_cane: false,
    allergies: [],
  });
  const [budgetTier, setBudgetTier] = useState<BudgetTier>("mid-range");
  const [transportOptions, setTransportOptions] = useState<TransportOption[]>([]);
  const [pivotAlert, setPivotAlert] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const loadItinerary = useCallback(async () => {
    setIsLoadingItinerary(true);
    try {
      const res = await fetch(`/api/itinerary?user_id=${DEMO_USER_ID}`);
      if (res.ok) {
        const data = await res.json();
        setItinerary(data);
      }
    } catch {
      // No itinerary yet — that's fine
    } finally {
      setIsLoadingItinerary(false);
    }
  }, []);

  // No auto-load on mount — page always starts fresh.
  // loadItinerary is called after buildFromSelections saves a new itinerary.

  // GPS pivot detection
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        if (!itinerary) return;
        try {
          const res = await fetch("/api/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: DEMO_USER_ID,
              itinerary_id: itinerary.id,
              trigger: "location_deviation",
              current_location: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy_meters: pos.coords.accuracy,
                timestamp: new Date().toISOString(),
              },
            }),
          });
          const data = await res.json();
          if (data.requires_pivot && data.voice_message) {
            setPivotAlert(data.voice_message);
          }
        } catch {
          // Silently fail
        }
      },
      undefined,
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [itinerary]);

  // ── Chat update handler ─────────────────────────────────────
  const handleChatUpdate = (update: ChatResponse) => {
    if (update.mode === "suggest" && update.trip_suggestions) {
      // Switch to the multi-step planning flow
      setTripSuggestions(update.trip_suggestions);
      setSelectedActivityIds(new Set());
      setFlowStep("picking");
      setActiveTab("timeline"); // show center panel on mobile
      return;
    }
    if (update.itinerary_update) {
      loadItinerary();
    }
    if (update.transport_options?.length) {
      setTransportOptions(update.transport_options);
      setSidePanel("transport");
    }
  };

  // ── Activity picker handlers ────────────────────────────────
  const handleToggleActivity = (id: string) => {
    setSelectedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBuildTrip = async () => {
    if (selectedActivityIds.size === 0) {
      toast.error("Pick at least one activity first");
      return;
    }
    setBuildSource("picker");
    setLoadingOverlayMsg("Scheduling your activities...");
    setFlowStep("building");
    try {
      const res = await fetch("/api/itinerary/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          selected_ids: Array.from(selectedActivityIds),
          suggestions: tripSuggestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Build failed");
        setFlowStep("picking");
        return;
      }
      if (data.conflicts?.length) {
        setPendingConflicts(data.conflicts);
        setLoadingOverlayMsg(null);
        setFlowStep("conflict");
      } else {
        setPendingItineraryId(data.itinerary_id);
        await loadItinerary();
        setLoadingOverlayMsg(null);
        setFlowStep("food_ask");
      }
    } catch {
      toast.error("Couldn't build trip");
      setLoadingOverlayMsg(null);
      setFlowStep("picking");
    }
  };

  // ── Conflict resolver handler ───────────────────────────────
  const handleConflictResolved = async (winnerIds: string[]) => {
    setBuildSource("conflict");
    setLoadingOverlayMsg("Resolving conflicts and building...");
    setFlowStep("building");
    try {
      // Remove conflict losers; keep winners
      const loserIds = new Set<string>();
      for (const conflict of pendingConflicts) {
        for (const opt of conflict.options) {
          if (!winnerIds.includes(opt.id)) loserIds.add(opt.id);
        }
      }
      const resolvedIds = Array.from(selectedActivityIds).filter((id) => !loserIds.has(id));

      const res = await fetch("/api/itinerary/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          selected_ids: resolvedIds,
          suggestions: tripSuggestions,
          resolved_conflicts: winnerIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Build failed");
        setFlowStep("conflict");
        return;
      }
      setPendingItineraryId(data.itinerary_id);
      await loadItinerary();
      setLoadingOverlayMsg(null);
      setFlowStep("food_ask");
    } catch {
      toast.error("Couldn't resolve conflicts");
      setLoadingOverlayMsg(null);
      setFlowStep("conflict");
    }
  };

  // ── Food decision handler ───────────────────────────────────
  const handleFoodDecision = async (choice: "ai" | "pick" | "skip") => {
    if (isFoodFetching) return; // guard against double-click
    if (choice === "skip") {
      setFlowStep("done");
      toast.success("Your itinerary is ready!");
      return;
    }

    // Show loading immediately so the user knows something is happening
    setIsFoodFetching(true);

    const cities = tripSuggestions?.cities.map((c) => c.city) ?? [];
    const startDate = tripSuggestions?.start_date ?? new Date().toISOString().split("T")[0];
    const endDate = tripSuggestions?.end_date ?? startDate;

    if (choice === "ai") {
      setFoodAddSource("ask");
      setLoadingOverlayMsg("Finding the best local restaurants...");
      setFlowStep("adding_food");
      try {
        // First fetch suggestions, then add — same flow as "pick" but auto-selects
        const foodRes = await fetch("/api/itinerary/food", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: DEMO_USER_ID, cities, date_range: { from: startDate, to: endDate } }),
        });
        const foodData = await foodRes.json();
        if (!foodRes.ok || !foodData.food?.length) {
          toast.error("Couldn't find food suggestions");
          setLoadingOverlayMsg(null);
          setFlowStep("food_ask");
          setIsFoodFetching(false);
          return;
        }
        setLoadingOverlayMsg("Adding meals to your itinerary...");
        const res = await fetch("/api/itinerary/add-food", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: DEMO_USER_ID,
            itinerary_id: pendingItineraryId,
            food_suggestions: foodData.food,
            ai_pick: true,
            num_days: numDays,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          toast.error(d.error || "Couldn't add food");
        } else {
          await loadItinerary();
          toast.success("AI added meals to your plan!");
        }
      } catch {
        toast.error("Couldn't add food");
      }
      setIsFoodFetching(false);
      setLoadingOverlayMsg(null);
      setFlowStep("done");
      return;
    }

    // choice === "pick" — fetch suggestions then show picker
    try {
      const res = await fetch("/api/itinerary/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          cities,
          date_range: { from: startDate, to: endDate },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't fetch food");
        setIsFoodFetching(false);
        setFlowStep("done");
        return;
      }
      setFoodSuggestions(data.food ?? []);
      setSelectedFoodIds(new Set());
      setIsFoodFetching(false);
      setFlowStep("food_pick");
    } catch {
      toast.error("Couldn't fetch food suggestions");
      setIsFoodFetching(false);
      setFlowStep("done");
    }
  };

  // ── Food picker confirm handler ─────────────────────────────
  const handleAddFood = async () => {
    setFoodAddSource("pick");
    setLoadingOverlayMsg("Adding your food picks...");
    setFlowStep("adding_food");
    try {
      const res = await fetch("/api/itinerary/add-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          itinerary_id: pendingItineraryId,
          selected_food_ids: Array.from(selectedFoodIds),
          food_suggestions: foodSuggestions,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Couldn't add food");
      } else {
        await loadItinerary();
        toast.success("Meals added to your plan!");
      }
    } catch {
      toast.error("Couldn't add food");
    }
    setLoadingOverlayMsg(null);
    setFlowStep("done");
  };

  // ── Radio-group node toggle (selection mode) ────────────────
  const handleToggleNode = (nodeId: string, slotNodeIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const wasSelected = prev.has(nodeId);
      for (const id of slotNodeIds) next.delete(id);
      if (!wasSelected) next.add(nodeId);
      return next;
    });
  };

  const handleFinalize = async () => {
    if (!itinerary || selectedIds.size === 0) return;
    setIsFinalizing(true);
    try {
      const res = await fetch("/api/itinerary/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          itinerary_id: itinerary.id,
          selected_node_ids: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Finalization failed"); return; }
      setItinerary(data.itinerary);
      setSelectionMode(false);
      setSelectedIds(new Set());
      toast.success("Plan finalized with transport options!");
    } catch {
      toast.error("Couldn't finalize plan");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleNodeSelect = async (nodeId: string) => {
    if (!itinerary) return;
    try {
      await fetch("/api/itinerary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_active_node",
          itinerary_id: itinerary.id,
          node_id: nodeId,
        }),
      });
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: prev.nodes.map((n) => ({ ...n, is_active: n.id === nodeId })),
        };
      });
      toast.success("Plan updated!");
    } catch {
      toast.error("Couldn't update plan");
    }
  };

  const handleAccessSave = async () => {
    toast.success("Accessibility preferences saved!");
    setSidePanel(null);
  };

  // ── Side panel content ──────────────────────────────────────
  const sidePanelContent = {
    accessibility: (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Accessibility className="w-4 h-4" />
          Accessibility Settings
        </h2>
        <AccessibilityPanel
          preferences={accessPrefs}
          onChange={setAccessPrefs}
          onSave={handleAccessSave}
        />
      </div>
    ),
    budget: (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Budget Filter
        </h2>
        <BudgetSlider
          value={budgetTier}
          onChange={(tier) => {
            setBudgetTier(tier);
            toast.success(`Filtering for ${tier} options`);
          }}
        />
        <p className="mt-4 text-xs text-zinc-600">
          Itinerary will re-filter activities matching your budget preference.
        </p>
      </div>
    ),
    transport: (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Map className="w-4 h-4" />
          Transport Options
        </h2>
        <TransportPanel options={transportOptions} />
        {!transportOptions.length && (
          <p className="text-xs text-zinc-600 text-center py-8">
            Ask "How do I get there?" to see options
          </p>
        )}
      </div>
    ),
    memory: <MemoryPanel userId={DEMO_USER_ID} />,
  };

  // ── Helpers ─────────────────────────────────────────────────
  const numDays = tripSuggestions
    ? Math.max(1, Math.ceil(
        (new Date(tripSuggestions.end_date + "T00:00:00").getTime() -
          new Date(tripSuggestions.start_date + "T00:00:00").getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1)
    : 1;

  // ── Center panel content ────────────────────────────────────
  const isInFlow = flowStep !== "idle" && flowStep !== "done";
  const showTimeline = flowStep === "idle" || flowStep === "done";

  // Derive PlanningSteps current step
  const planningStepForBadge =
    flowStep === "picking" || flowStep === "suggesting" ? "picking"
    : flowStep === "conflict" ? "conflict"
    : flowStep === "food_ask" || flowStep === "food_pick" || flowStep === "adding_food" ? "food"
    : "done";

  const hasConflicts = pendingConflicts.length > 0;

  function renderCenterContent() {
    switch (flowStep) {
      case "suggesting":
        return (
          <div className="flex-1 flex items-center justify-center">
            <BuildingSpinner step="suggesting" />
          </div>
        );

      // Keep the picker on screen while building from the picker
      case "picking":
        return tripSuggestions ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
              <PlanningSteps currentStep="picking" hasConflicts={false} />
            </div>
            <div className="flex-1 overflow-y-auto">
              <ActivityPicker
                suggestions={tripSuggestions}
                selectedIds={selectedActivityIds}
                onToggle={handleToggleActivity}
                onBuildTrip={handleBuildTrip}
                isBuilding={false}
              />
            </div>
          </div>
        ) : null;

      // While building, keep whichever screen triggered it — overlay shows on top
      case "building":
        if (buildSource === "conflict") {
          return (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
                <PlanningSteps currentStep="conflict" hasConflicts={true} />
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConflictResolver
                  conflicts={pendingConflicts}
                  onResolved={() => {}}
                  isResolving={true}
                />
              </div>
              <LoadingOverlay message={loadingOverlayMsg ?? "Building your trip..."} />
            </div>
          );
        }
        return tripSuggestions ? (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
              <PlanningSteps currentStep="picking" hasConflicts={false} />
            </div>
            <div className="flex-1 overflow-y-auto">
              <ActivityPicker
                suggestions={tripSuggestions}
                selectedIds={selectedActivityIds}
                onToggle={() => {}}
                onBuildTrip={() => {}}
                isBuilding={true}
              />
            </div>
            <LoadingOverlay message={loadingOverlayMsg ?? "Scheduling your activities..."} />
          </div>
        ) : null;

      case "conflict":
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
              <PlanningSteps currentStep="conflict" hasConflicts={true} />
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConflictResolver
                conflicts={pendingConflicts}
                onResolved={handleConflictResolved}
                isResolving={false}
              />
            </div>
          </div>
        );

      case "food_ask":
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
              <PlanningSteps currentStep="food" hasConflicts={hasConflicts} />
            </div>
            <div className="flex-1 overflow-y-auto flex items-center justify-center">
              <FoodAskStep onDecide={handleFoodDecision} isLoading={isFoodFetching} />
            </div>
          </div>
        );

      case "food_pick":
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
              <PlanningSteps currentStep="food" hasConflicts={hasConflicts} />
            </div>
            <div className="flex-1 overflow-y-auto">
              <FoodPicker
                suggestions={foodSuggestions}
                selectedIds={selectedFoodIds}
                onToggle={(id) => {
                  setSelectedFoodIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onConfirm={handleAddFood}
                isAdding={false}
              />
            </div>
          </div>
        );

      // Keep the relevant food screen visible while saving — overlay shows on top
      case "adding_food":
        return foodAddSource === "pick" ? (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
              <PlanningSteps currentStep="food" hasConflicts={hasConflicts} />
            </div>
            <div className="flex-1 overflow-y-auto">
              <FoodPicker
                suggestions={foodSuggestions}
                selectedIds={selectedFoodIds}
                onToggle={() => {}}
                onConfirm={() => {}}
                isAdding={true}
              />
            </div>
            <LoadingOverlay message={loadingOverlayMsg ?? "Adding your food picks..."} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="px-6 pt-4 pb-2 border-b border-zinc-900">
              <PlanningSteps currentStep="food" hasConflicts={hasConflicts} />
            </div>
            <div className="flex-1 overflow-y-auto flex items-center justify-center">
              <FoodAskStep onDecide={() => {}} isLoading={true} />
            </div>
            <LoadingOverlay message={loadingOverlayMsg ?? "Finding the best local restaurants..."} />
          </div>
        );

      default:
        // idle or done — show timeline
        return isLoadingItinerary ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-600">Loading your itinerary...</p>
            </div>
          </div>
        ) : itinerary ? (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <BranchingTimeline
              itinerary={itinerary}
              onNodeSelect={handleNodeSelect}
              onBranchSwitch={(nodeId, label) => {
                toast.success(`Switched to path ${label}`);
                handleNodeSelect(nodeId);
              }}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggle={handleToggleNode}
              onFinalize={handleFinalize}
              isFinalizing={isFinalizing}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <span className="text-5xl mb-4">🗾</span>
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">No itinerary yet</h2>
            <p className="text-sm text-zinc-600 max-w-sm">
              Start a conversation in the chat panel. Try: "Plan 3 days in Tokyo" or tap the
              voice orb to talk.
            </p>
          </div>
        );
    }
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* ── Left sidebar: Chat ─────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col border-r border-zinc-900 bg-zinc-950",
          isMobile
            ? activeTab === "chat"
              ? "w-full"
              : "hidden"
            : "w-80 shrink-0"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗺️</span>
            <span className="font-bold text-white">Planit</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidePanel(sidePanel === "memory" ? null : "memory")}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                sidePanel === "memory"
                  ? "bg-violet-600/20 text-violet-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              )}
              title="AI Memory"
            >
              <Brain className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSidePanel(sidePanel === "accessibility" ? null : "accessibility")}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                sidePanel === "accessibility"
                  ? "bg-violet-600/20 text-violet-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              )}
              title="Accessibility"
            >
              <Accessibility className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSidePanel(sidePanel === "budget" ? null : "budget")}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                sidePanel === "budget"
                  ? "bg-violet-600/20 text-violet-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              )}
              title="Budget"
            >
              <DollarSign className="w-4 h-4" />
            </button>
          </div>
        </div>

        <ChatPanel
          userId={DEMO_USER_ID}
          itineraryId={itinerary?.id}
          onItineraryUpdate={handleChatUpdate}
          className="flex-1 overflow-hidden"
        />
      </div>

      {/* ── Center: Multi-step flow or Timeline ────────────── */}
      <div
        className={cn(
          "flex-1 flex flex-col overflow-hidden",
          isMobile && activeTab !== "timeline" && "hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900">
          <div>
            <h1 className="text-sm font-semibold text-white">
              {isInFlow
                ? tripSuggestions?.trip_title ?? "Planning your trip..."
                : itinerary?.title ?? "Your Itinerary"}
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5">
              {isInFlow
                ? tripSuggestions?.destination ?? ""
                : itinerary?.destination ?? "Start a conversation to plan your trip"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Cancel flow button */}
            {isInFlow && (
              <button
                onClick={() => {
                  setFlowStep("idle");
                  setTripSuggestions(null);
                  setSelectedActivityIds(new Set());
                  setPendingConflicts([]);
                  setFoodSuggestions([]);
                }}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            {/* Customize button (timeline mode only) */}
            {showTimeline && itinerary && (
              <button
                onClick={() => {
                  setSelectionMode((v) => !v);
                  setSelectedIds(new Set());
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors",
                  selectionMode
                    ? "bg-violet-600/20 text-violet-400 border border-violet-500/30"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                )}
                title={selectionMode ? "Cancel selection" : "Select activities"}
              >
                {selectionMode ? (
                  <><X className="w-3.5 h-3.5" /> Cancel</>
                ) : (
                  <><ListChecks className="w-3.5 h-3.5" /> Customize</>
                )}
              </button>
            )}
            <button
              onClick={loadItinerary}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", isLoadingItinerary && "animate-spin")} />
            </button>
            <button
              onClick={() => setSidePanel(sidePanel === "transport" ? null : "transport")}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                sidePanel === "transport"
                  ? "bg-violet-600/20 text-violet-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              )}
              title="Transport"
            >
              <Map className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pivot alert banner */}
        <AnimatePresence>
          {pivotAlert && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-amber-500/20 bg-amber-500/5"
            >
              <div className="flex items-start gap-3 px-6 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200 flex-1">{pivotAlert}</p>
                <button
                  onClick={() => setPivotAlert(null)}
                  className="text-zinc-600 hover:text-zinc-400 text-xs"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderCenterContent()}
        </div>
      </div>

      {/* ── Right panel (contextual) ────────────────────────── */}
      <AnimatePresence>
        {sidePanel && sidePanelContent[sidePanel] && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-l border-zinc-900 bg-zinc-950 overflow-hidden shrink-0"
          >
            <div className="w-[300px] h-full overflow-y-auto">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <span />
                <button
                  onClick={() => setSidePanel(null)}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {sidePanelContent[sidePanel]}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile bottom tab bar ───────────────────────────── */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm flex">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors",
              activeTab === "chat" ? "text-violet-400" : "text-zinc-600"
            )}
          >
            <MessageSquare className="w-5 h-5" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={cn(
              "flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors",
              activeTab === "timeline" ? "text-violet-400" : "text-zinc-600"
            )}
          >
            <Map className="w-5 h-5" />
            {isInFlow ? "Planning" : "Itinerary"}
          </button>
          <button
            onClick={() => {
              setActiveTab("timeline");
              setSidePanel("accessibility");
            }}
            className="flex-1 flex flex-col items-center py-3 gap-1 text-xs text-zinc-600"
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </div>
      )}

      {/* Voice Orb — anchored to bottom-right of the chat sidebar */}
      <VoiceOrb
        userId={DEMO_USER_ID}
        onTranscript={() => {}}
        onResponse={(text) => {
          if (text.toLowerCase().includes("itinerary") || text.toLowerCase().includes("plan")) {
            setTimeout(loadItinerary, 2000);
          }
        }}
        className={isMobile ? "bottom-16 right-4" : "bottom-6 left-[264px] right-auto"}
      />
    </div>
  );
}
