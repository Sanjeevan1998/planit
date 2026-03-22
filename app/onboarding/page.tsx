"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Mic, ArrowRight, ChevronRight, Loader2 } from "lucide-react";
import { AccessibilityPanel } from "@/components/accessibility/AccessibilityPanel";
import { BudgetSlider } from "@/components/itinerary/BudgetSlider";
import { cn } from "@/lib/utils";
import type { AccessibilityPreferences, BudgetTier } from "@/types";
import toast from "react-hot-toast";

// Demo user — replace with real auth
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

type Step = "welcome" | "accessibility" | "budget" | "voice_intro" | "done";

const STEPS: Step[] = ["welcome", "accessibility", "budget", "voice_intro", "done"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [accessPrefs, setAccessPrefs] = useState<Partial<AccessibilityPreferences>>({
    allergies: [],
    dietary_restrictions: [],
  });
  const [budgetTier, setBudgetTier] = useState<BudgetTier>("mid-range");
  const [isSaving, setIsSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const saveAndFinish = async () => {
    setIsSaving(true);
    try {
      // Save memories from onboarding
      const memories = [
        { category: "custom" as const, key: "user_name", value: name },
        { category: "custom" as const, key: "travel_destination", value: destination },
        { category: "budget" as const, key: "preferred_budget_tier", value: budgetTier },
        ...(accessPrefs.uses_cane
          ? [{ category: "accessibility" as const, key: "uses_cane", value: "true" }]
          : []),
        ...(accessPrefs.requires_elevator
          ? [{ category: "accessibility" as const, key: "requires_elevator", value: "true" }]
          : []),
        ...(accessPrefs.low_sensory
          ? [{ category: "vibe" as const, key: "prefers_low_sensory", value: "true" }]
          : []),
        ...(accessPrefs.allergies?.map((a) => ({
          category: "allergies" as const,
          key: `allergy_${a.item.replace(/\s+/g, "_")}`,
          value: `Allergic to ${a.item} (${a.severity})`,
        })) || []),
      ].filter((m) => m.value && m.value !== "false");

      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: DEMO_USER_ID, memories }),
      });

      // Save accessibility preferences
      if (Object.values(accessPrefs).some(Boolean)) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `My name is ${name}. I'm traveling to ${destination}. My accessibility needs: ${[
              accessPrefs.uses_cane && "uses a cane",
              accessPrefs.requires_elevator && "needs elevator access",
              accessPrefs.low_sensory && "prefers quiet/low-sensory spaces",
              ...(accessPrefs.allergies?.map((a) => `allergic to ${a.item}`) || []),
            ]
              .filter(Boolean)
              .join(", ")}. Budget: ${budgetTier}.`,
            user_id: DEMO_USER_ID,
          }),
        });
        if (!res.ok) throw new Error("Failed to initialize");
      }

      setStep("done");
    } catch {
      toast.error("Couldn't save preferences. You can update them later.");
      router.push("/dashboard");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 py-12">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-zinc-900">
        <motion.div
          className="h-full bg-gradient-to-r from-violet-600 to-indigo-500"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* ── Welcome ──────────────────────────────────────── */}
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <span className="text-5xl">🗺️</span>
              <h1 className="mt-6 text-3xl font-bold text-white">Welcome to Planit</h1>
              <p className="mt-3 text-zinc-400 leading-relaxed">
                Let's take 2 minutes to get to know you. Your preferences are stored so every
                trip feels personally crafted.
              </p>

              <div className="mt-8 space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 font-medium uppercase tracking-wide block mb-1.5">
                    Your first name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sarah"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 font-medium uppercase tracking-wide block mb-1.5">
                    Where are you headed?
                  </label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Tokyo, Japan"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 text-sm"
                  />
                </div>
              </div>

              <button
                onClick={goNext}
                disabled={!name.trim() || !destination.trim()}
                className="w-full mt-6 flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* ── Accessibility ─────────────────────────────────── */}
          {step === "accessibility" && (
            <motion.div
              key="accessibility"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Accessibility & Health</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  These help Planit filter unsafe places and find accessible routes. All
                  optional.
                </p>
              </div>

              <AccessibilityPanel
                preferences={accessPrefs}
                onChange={setAccessPrefs}
              />

              <button
                onClick={goNext}
                className="w-full mt-6 flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={goNext}
                className="w-full mt-2 py-2 text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Skip for now
              </button>
            </motion.div>
          )}

          {/* ── Budget ────────────────────────────────────────── */}
          {step === "budget" && (
            <motion.div
              key="budget"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">What's your travel style?</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  This is your default — you can always override it for specific activities.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                <BudgetSlider value={budgetTier} onChange={setBudgetTier} />
              </div>

              <button
                onClick={goNext}
                className="w-full mt-6 flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* ── Voice Intro ───────────────────────────────────── */}
          {step === "voice_intro" && (
            <motion.div
              key="voice_intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center mx-auto shadow-2xl shadow-violet-500/30">
                <Mic className="w-8 h-8 text-white" />
              </div>

              <h2 className="mt-6 text-2xl font-bold text-white">Meet your voice sidekick</h2>
              <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                The glowing orb in the corner of your screen is always listening. Just tap and
                talk naturally. Say things like:
              </p>

              <div className="mt-5 space-y-2 text-left">
                {[
                  '"Show me what Saturday looks like"',
                  '"Find a quiet café with no chains nearby"',
                  '"That restaurant was too loud for me"',
                  '"How do I get to the garden without stairs?"',
                ].map((q) => (
                  <div
                    key={q}
                    className="flex items-start gap-2 p-3 rounded-xl bg-zinc-800/50 border border-zinc-800"
                  >
                    <span className="text-violet-400 text-xs mt-0.5">💬</span>
                    <p className="text-sm text-zinc-300 italic">{q}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={saveAndFinish}
                disabled={isSaving}
                className="w-full mt-8 flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up your profile...
                  </>
                ) : (
                  <>
                    Start exploring {destination}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          )}

          {/* ── Done ─────────────────────────────────────────── */}
          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="text-6xl"
              >
                🎉
              </motion.div>
              <h2 className="mt-6 text-2xl font-bold text-white">
                You're all set, {name}!
              </h2>
              <p className="mt-3 text-sm text-zinc-400">
                Planit knows your needs and is ready to plan {destination}. Your memory grows
                smarter with every trip.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full mt-8 flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
              >
                Open Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step indicator */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-1.5 mt-8">
            {STEPS.slice(0, -1).map((s, i) => (
              <div
                key={s}
                className={cn(
                  "rounded-full transition-all",
                  i === stepIndex
                    ? "w-4 h-1.5 bg-violet-500"
                    : i < stepIndex
                    ? "w-1.5 h-1.5 bg-violet-700"
                    : "w-1.5 h-1.5 bg-zinc-800"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
