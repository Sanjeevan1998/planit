"use client";

// ============================================================
// GlobalVoiceAssistant
// Floating orb that powers the Gemini Live voice session.
// Persists across route changes (mounted in RootLayout).
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Volume2, X, Loader2, ChevronDown } from "lucide-react";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { usePlanitStore } from "@/store/planit";
import { cn } from "@/lib/utils";
import type { TranscriptMessage } from "@/hooks/useGeminiLive";

// ── Orb colours per voice state ─────────────────────────────

const ORB_GRADIENT: Record<string, string> = {
  idle: "from-violet-600 to-indigo-700",
  listening: "from-rose-500 to-pink-600",
  thinking: "from-amber-500 to-orange-600",
  speaking: "from-emerald-500 to-teal-600",
};

const STATE_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
};

// ── Transcript bubble ────────────────────────────────────────

function Bubble({ msg }: { msg: TranscriptMessage }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={cn(
        "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-snug",
        isUser
          ? "self-end bg-violet-600/25 text-violet-100"
          : "self-start bg-zinc-800 text-zinc-200"
      )}
    >
      {msg.text}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

export function GlobalVoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimised, setIsMinimised] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { itinerary, userId, tripSuggestions, setItinerary } = usePlanitStore();

  const { connectionState, voiceState, transcript, audioLevel, connect, disconnect, interrupt } =
    useGeminiLive({
      userId,
      itinerary,
      tripSuggestions,
      onItineraryUpdate: setItinerary,
    });

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";
  const isActive = isConnected || isConnecting;

  // Auto-scroll transcript to bottom.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // ── Toggle open/close ──────────────────────────────────────

  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    setIsMinimised(false);
    if (connectionState === "idle") await connect();
  }, [connectionState, connect]);

  const handleClose = useCallback(() => {
    disconnect();
    setIsOpen(false);
    setIsMinimised(false);
  }, [disconnect]);

  // ── Derived display values ─────────────────────────────────

  const currentState = isConnecting
    ? "connecting"
    : voiceState ?? "idle";

  const gradientKey = isOpen ? (voiceState ?? "idle") : "idle";
  const orbGradient = `bg-gradient-to-br ${ORB_GRADIENT[gradientKey] ?? ORB_GRADIENT.idle}`;

  // Audio level drives orb scale when listening.
  const orbScale = isConnected && voiceState === "listening" ? 1 + audioLevel * 0.35 : 1;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">

      {/* ── Panel ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && !isMinimised && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.95 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="pointer-events-auto w-80 bg-zinc-900/95 border border-zinc-700/80 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden"
            style={{ maxHeight: "22rem" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    isConnected
                      ? "bg-emerald-400 animate-pulse"
                      : isConnecting
                      ? "bg-amber-400 animate-pulse"
                      : "bg-zinc-600"
                  )}
                />
                <span className="text-xs font-medium text-zinc-300 tracking-wide">
                  {STATE_LABEL[currentState] ?? "Planit Voice"}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Minimise */}
                <button
                  onClick={() => setIsMinimised(true)}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
                  aria-label="Minimise"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                {/* Close + disconnect */}
                <button
                  onClick={handleClose}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
                  aria-label="End conversation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Transcript */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0"
            >
              {transcript.length === 0 && isConnected && (
                <p className="text-zinc-600 text-xs text-center mt-6">
                  Start talking — I'm listening.
                </p>
              )}
              {transcript.length === 0 && isConnecting && (
                <p className="text-zinc-600 text-xs text-center mt-6 animate-pulse">
                  Connecting to Planit…
                </p>
              )}
              {transcript.map((msg, i) => (
                <Bubble key={i} msg={msg} />
              ))}
            </div>

            {/* Barge-in hint when model is speaking */}
            {voiceState === "speaking" && (
              <div className="px-4 py-2 border-t border-zinc-800 shrink-0">
                <button
                  onClick={interrupt}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-center"
                >
                  Tap orb or say anything to interrupt
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Orb button ─────────────────────────────────────── */}
      <div className="pointer-events-auto relative flex items-center justify-center">

        {/* Pulse rings — only when active */}
        {isActive && (
          <>
            <motion.div
              className="absolute rounded-full bg-violet-500/20"
              animate={{ scale: [1, 1.9, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: 72, height: 72 }}
            />
            <motion.div
              className="absolute rounded-full bg-violet-500/10"
              animate={{ scale: [1, 2.4, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.35 }}
              style={{ width: 72, height: 72 }}
            />
          </>
        )}

        <motion.button
          onClick={isOpen ? interrupt : handleOpen}
          animate={{ scale: orbScale }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          whileHover={{ scale: orbScale * 1.08 }}
          whileTap={{ scale: orbScale * 0.94 }}
          className={cn(
            "relative w-14 h-14 rounded-full flex items-center justify-center",
            "shadow-2xl transition-colors duration-300 cursor-pointer border-0",
            orbGradient
          )}
          aria-label={isOpen ? "Interrupt" : "Talk to Planit"}
          title={isOpen ? "Tap to interrupt" : "Talk to Planit"}
        >
          {isConnecting && <Loader2 className="w-6 h-6 text-white animate-spin" />}

          {!isConnecting && !isOpen && <Mic className="w-6 h-6 text-white" />}

          {isConnected && voiceState === "listening" && (
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
            >
              <Mic className="w-6 h-6 text-white" />
            </motion.div>
          )}

          {isConnected && voiceState === "thinking" && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
            />
          )}

          {isConnected && voiceState === "speaking" && (
            <Volume2 className="w-6 h-6 text-white" />
          )}
        </motion.button>

        {/* Minimised indicator dot */}
        {isOpen && isMinimised && (
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setIsMinimised(false)}
            className="absolute -top-1 -left-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-zinc-900 cursor-pointer"
            title="Expand transcript"
          >
            <span className="text-[8px] font-bold text-white">{transcript.length}</span>
          </motion.button>
        )}
      </div>
    </div>
  );
}
