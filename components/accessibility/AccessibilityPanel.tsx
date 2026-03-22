"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Accessibility,
  Eye,
  Ear,
  Brain,
  AlertTriangle,
  Plus,
  X,
  Save,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccessibilityPreferences, Allergy } from "@/types";

interface AccessibilityPanelProps {
  preferences: Partial<AccessibilityPreferences>;
  onChange: (prefs: Partial<AccessibilityPreferences>) => void;
  onSave?: () => void;
  compact?: boolean;
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center justify-between w-full px-3 py-2.5 rounded-xl border transition-all text-left",
        checked
          ? "bg-violet-500/10 border-violet-500/40 text-violet-300"
          : "bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
      )}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div
        className={cn(
          "w-9 h-5 rounded-full transition-colors relative shrink-0 ml-3",
          checked ? "bg-violet-600" : "bg-zinc-700"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </div>
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  isOpen,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full text-left group"
    >
      <div className="flex items-center gap-2.5">
        <div className="text-zinc-400 group-hover:text-zinc-300 transition-colors">{icon}</div>
        <span className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">
          {title}
        </span>
      </div>
      <ChevronDown
        className={cn(
          "w-4 h-4 text-zinc-600 transition-transform",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

export function AccessibilityPanel({
  preferences,
  onChange,
  onSave,
  compact = false,
}: AccessibilityPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["mobility", "dietary"])
  );
  const [newAllergyInput, setNewAllergyInput] = useState("");

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const update = (key: keyof AccessibilityPreferences, value: unknown) => {
    onChange({ ...preferences, [key]: value });
  };

  const addAllergy = () => {
    const trimmed = newAllergyInput.trim().toLowerCase();
    if (!trimmed) return;
    const existing = preferences.allergies || [];
    const newAllergy: Allergy = { item: trimmed, severity: "moderate" };
    update("allergies", [...existing, newAllergy]);
    setNewAllergyInput("");
  };

  const removeAllergy = (item: string) => {
    update(
      "allergies",
      (preferences.allergies || []).filter((a) => a.item !== item)
    );
  };

  return (
    <div className={cn("space-y-1", compact && "text-sm")}>
      {/* ── Mobility ─────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-3 bg-zinc-900/60">
          <SectionHeader
            icon={<Accessibility className="w-4 h-4" />}
            title="Mobility"
            isOpen={openSections.has("mobility")}
            onToggle={() => toggleSection("mobility")}
          />
        </div>
        {openSections.has("mobility") && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="px-3 pb-3 space-y-2 bg-zinc-900/30"
          >
            <Toggle
              label="Uses a cane"
              checked={preferences.uses_cane || false}
              onChange={(v) => update("uses_cane", v)}
            />
            <Toggle
              label="Uses a wheelchair"
              checked={preferences.uses_wheelchair || false}
              onChange={(v) => update("uses_wheelchair", v)}
            />
            <Toggle
              label="Requires elevator access"
              description="Will filter transit routes for elevator availability"
              checked={preferences.requires_elevator || false}
              onChange={(v) => update("requires_elevator", v)}
            />
            <Toggle
              label="Requires ramp access"
              checked={preferences.requires_ramp || false}
              onChange={(v) => update("requires_ramp", v)}
            />
          </motion.div>
        )}
      </div>

      {/* ── Sensory ──────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-3 bg-zinc-900/60">
          <SectionHeader
            icon={<Brain className="w-4 h-4" />}
            title="Sensory"
            isOpen={openSections.has("sensory")}
            onToggle={() => toggleSection("sensory")}
          />
        </div>
        {openSections.has("sensory") && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            className="px-3 pb-3 space-y-2 bg-zinc-900/30"
          >
            <Toggle
              label="Low-sensory preference"
              description="Prioritizes quiet, calm, low-stimulation environments"
              checked={preferences.low_sensory || false}
              onChange={(v) => update("low_sensory", v)}
            />
            <Toggle
              label="Light sensitivity"
              description="Avoids bright or flashing environments"
              checked={preferences.light_sensitivity || false}
              onChange={(v) => update("light_sensitivity", v)}
            />
          </motion.div>
        )}
      </div>

      {/* ── Vision / Hearing ─────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-3 bg-zinc-900/60">
          <SectionHeader
            icon={<Eye className="w-4 h-4" />}
            title="Vision & Hearing"
            isOpen={openSections.has("vision")}
            onToggle={() => toggleSection("vision")}
          />
        </div>
        {openSections.has("vision") && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            className="px-3 pb-3 space-y-2 bg-zinc-900/30"
          >
            <Toggle
              label="Low vision"
              checked={preferences.low_vision || false}
              onChange={(v) => update("low_vision", v)}
            />
            <Toggle
              label="Blind"
              checked={preferences.blind || false}
              onChange={(v) => update("blind", v)}
            />
            <Toggle
              label="Hard of hearing"
              checked={preferences.hard_of_hearing || false}
              onChange={(v) => update("hard_of_hearing", v)}
            />
            <Toggle
              label="Deaf"
              checked={preferences.deaf || false}
              onChange={(v) => update("deaf", v)}
            />
          </motion.div>
        )}
      </div>

      {/* ── Dietary / Allergies ──────────────────────── */}
      <div className="rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-3 bg-zinc-900/60">
          <SectionHeader
            icon={<AlertTriangle className="w-4 h-4" />}
            title="Dietary & Allergies"
            isOpen={openSections.has("dietary")}
            onToggle={() => toggleSection("dietary")}
          />
        </div>
        {openSections.has("dietary") && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            className="px-3 pb-3 space-y-3 bg-zinc-900/30"
          >
            {/* Allergy chips */}
            <div className="flex flex-wrap gap-2">
              {(preferences.allergies || []).map((a) => (
                <span
                  key={a.item}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium"
                >
                  <AlertTriangle className="w-3 h-3" />
                  {a.item}
                  <button
                    onClick={() => removeAllergy(a.item)}
                    className="hover:text-rose-300 transition-colors ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {!(preferences.allergies?.length) && (
                <span className="text-xs text-zinc-600">No allergies added</span>
              )}
            </div>

            {/* Add allergy input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newAllergyInput}
                onChange={(e) => setNewAllergyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAllergy()}
                placeholder="Add allergy (e.g. shellfish)"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60"
              />
              <button
                onClick={addAllergy}
                className="w-9 h-9 rounded-xl bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4 text-zinc-300" />
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Save button */}
      {onSave && (
        <button
          onClick={onSave}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors mt-2"
        >
          <Save className="w-4 h-4" />
          Save Preferences
        </button>
      )}
    </div>
  );
}
