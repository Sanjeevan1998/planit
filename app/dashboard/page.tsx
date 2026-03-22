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
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { BranchingTimeline } from "@/components/itinerary/BranchingTimeline";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { AccessibilityPanel } from "@/components/accessibility/AccessibilityPanel";
import { BudgetSlider } from "@/components/itinerary/BudgetSlider";
import { TransportPanel } from "@/components/itinerary/TransportPanel";
import { cn } from "@/lib/utils";
import type { Itinerary, AccessibilityPreferences, BudgetTier, ChatResponse, TransportOption } from "@/types";
import toast from "react-hot-toast";

// ============================================================
// Dashboard — The main Planit experience
// Left: Chat + Voice | Center: Branching Timeline | Right: Panels
// ============================================================

// Demo user — in production this comes from Supabase auth
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

type SidePanel = "accessibility" | "budget" | "transport" | null;

export default function DashboardPage() {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [isLoadingItinerary, setIsLoadingItinerary] = useState(true);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [activeTab, setActiveTab] = useState<"timeline" | "chat">("chat");
  const [isMobile, setIsMobile] = useState(false);

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

  // Load active itinerary
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

  useEffect(() => {
    loadItinerary();
  }, [loadItinerary]);

  // Poll for location-triggered pivots (in a real app, this is GPS-based)
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
          // Silently fail for background location
        }
      },
      undefined,
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [itinerary]);

  const handleChatUpdate = (update: ChatResponse) => {
    if (update.itinerary_update) {
      // Reload itinerary from server to get the persisted version
      loadItinerary();
    }
    if (update.transport_options?.length) {
      setTransportOptions(update.transport_options);
      setSidePanel("transport");
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
      // Update local state optimistically
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
    try {
      // In production, save to Supabase via API
      toast.success("Accessibility preferences saved!");
      setSidePanel(null);
    } catch {
      toast.error("Couldn't save preferences");
    }
  };

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
  };

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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗺️</span>
            <span className="font-bold text-white">Planit</span>
          </div>
          <div className="flex items-center gap-1">
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

        {/* Chat */}
        <ChatPanel
          userId={DEMO_USER_ID}
          itineraryId={itinerary?.id}
          onItineraryUpdate={handleChatUpdate}
          className="flex-1 overflow-hidden"
        />
      </div>

      {/* ── Center: Branching Timeline ─────────────────────── */}
      <div
        className={cn(
          "flex-1 flex flex-col overflow-hidden",
          isMobile && activeTab !== "timeline" && "hidden"
        )}
      >
        {/* Timeline header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900">
          <div>
            <h1 className="text-sm font-semibold text-white">
              {itinerary?.title || "Your Itinerary"}
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5">
              {itinerary?.destination || "Start a conversation to plan your trip"}
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Timeline content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoadingItinerary ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-zinc-600">Loading your itinerary...</p>
              </div>
            </div>
          ) : itinerary ? (
            <BranchingTimeline
              itinerary={itinerary}
              onNodeSelect={handleNodeSelect}
              onBranchSwitch={(nodeId, label) => {
                toast.success(`Switched to path ${label}`);
                handleNodeSelect(nodeId);
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <span className="text-5xl mb-4">🗾</span>
              <h2 className="text-lg font-semibold text-zinc-300 mb-2">No itinerary yet</h2>
              <p className="text-sm text-zinc-600 max-w-sm">
                Start a conversation in the chat panel. Try: "Plan my Saturday in Tokyo" or tap
                the voice orb to talk.
              </p>
            </div>
          )}
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
            Itinerary
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

      {/* Voice Orb */}
      <VoiceOrb
        userId={DEMO_USER_ID}
        onTranscript={(text) => {
          // Transcript is shown in orb bubble
        }}
        onResponse={(text) => {
          // Response shown in orb bubble — also triggers itinerary refresh if needed
          if (text.toLowerCase().includes("itinerary") || text.toLowerCase().includes("plan")) {
            setTimeout(loadItinerary, 2000);
          }
        }}
      />
    </div>
  );
}
