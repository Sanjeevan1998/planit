"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// VoiceOrb — Gemini Live voice interface
// A pulsing, voice-reactive orb that connects to Gemini Live
// via WebSocket. Supports barge-in (interrupt mid-response).
// ============================================================

interface VoiceOrbProps {
  userId: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
  className?: string;
}

type OrbState = "idle" | "listening" | "thinking" | "speaking";

export function VoiceOrb({ userId, onTranscript, onResponse, className }: VoiceOrbProps) {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch session config from our API
  const getSessionConfig = useCallback(async () => {
    const res = await fetch(`/api/voice?user_id=${userId}`);
    return res.json();
  }, [userId]);

  // Analyze microphone audio level for the orb animation
  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(avg / 128); // 0-1 normalized
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopAudioAnalysis();
    setOrbState("idle");
    setTranscript("");
  }, [stopAudioAnalysis]);

  const connect = useCallback(async () => {
    try {
      const config = await getSessionConfig();
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.api_key}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        // Send setup message
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${config.model}`,
              ...config.config,
            },
          })
        );

        // Start microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        startAudioAnalysis(stream);

        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(",")[1];
              ws.send(
                JSON.stringify({
                  realtime_input: {
                    media_chunks: [{ data: base64, mime_type: "audio/webm;codecs=opus" }],
                  },
                })
              );
            };
            reader.readAsDataURL(e.data);
          }
        };

        recorder.start(250); // Send chunks every 250ms
        setOrbState("listening");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.serverContent?.inputTranscription) {
            const text = data.serverContent.inputTranscription.text || "";
            setTranscript(text);
            onTranscript?.(text, false);
          }

          if (data.serverContent?.modelTurn?.parts) {
            setOrbState("speaking");
            const textParts = data.serverContent.modelTurn.parts
              .filter((p: { text?: string }) => p.text)
              .map((p: { text: string }) => p.text)
              .join("");
            if (textParts) {
              setResponse(textParts);
              onResponse?.(textParts);
            }
          }

          if (data.serverContent?.turnComplete) {
            setOrbState("listening");
          }
        } catch {
          // JSON parse error from binary audio data — ignore
        }
      };

      ws.onclose = () => {
        setOrbState("idle");
      };

      ws.onerror = () => {
        setOrbState("idle");
        disconnect();
      };
    } catch (err) {
      console.error("[VoiceOrb] Connection error:", err);
      setOrbState("idle");
    }
  }, [getSessionConfig, startAudioAnalysis, disconnect, onTranscript, onResponse]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const handleToggle = () => {
    if (orbState === "idle" && !isOpen) {
      setIsOpen(true);
      connect();
    } else if (orbState === "listening") {
      // Barge-in: interrupt current response
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ client_content: { turns: [], turn_complete: true } }));
      }
    }
  };

  const handleClose = () => {
    disconnect();
    setIsOpen(false);
    setResponse("");
    setTranscript("");
  };

  const orbScale = 1 + audioLevel * 0.4;
  const pulseScale = orbState === "thinking" ? [1, 1.15, 1] : orbState === "speaking" ? [1, 1 + audioLevel * 0.3, 1] : [1, 1.05, 1];

  return (
    <div className={cn("fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3", className)}>
      {/* Response bubble */}
      <AnimatePresence>
        {isOpen && (response || transcript) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="max-w-xs bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-xl"
          >
            {transcript && (
              <p className="text-zinc-400 text-sm mb-2 italic">"{transcript}"</p>
            )}
            {response && (
              <p className="text-white text-sm leading-relaxed">{response}</p>
            )}
            <div className="flex items-center gap-1.5 mt-2">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  orbState === "speaking" ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                )}
              />
              <span className="text-zinc-500 text-xs capitalize">{orbState}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orb Button */}
      <div className="relative flex items-center justify-center">
        {/* Outer pulse rings */}
        {(orbState === "listening" || orbState === "speaking") && (
          <>
            <motion.div
              className="absolute rounded-full bg-violet-500/20"
              animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: 72, height: 72 }}
            />
            <motion.div
              className="absolute rounded-full bg-violet-500/10"
              animate={{ scale: [1, 2.2, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              style={{ width: 72, height: 72 }}
            />
          </>
        )}

        {/* Main orb */}
        <motion.button
          onClick={handleToggle}
          animate={{ scale: orbState !== "idle" ? pulseScale : 1 }}
          transition={
            orbState !== "idle"
              ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
          style={{ scale: orbScale }}
          className={cn(
            "relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-colors cursor-pointer border-0",
            orbState === "idle"
              ? "bg-gradient-to-br from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600"
              : orbState === "listening"
              ? "bg-gradient-to-br from-rose-500 to-pink-600"
              : orbState === "thinking"
              ? "bg-gradient-to-br from-amber-500 to-orange-600"
              : "bg-gradient-to-br from-emerald-500 to-teal-600"
          )}
          title={orbState === "idle" ? "Talk to Planit" : "Tap to barge-in"}
        >
          {orbState === "idle" && <Mic className="w-6 h-6 text-white" />}
          {orbState === "listening" && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              <Mic className="w-6 h-6 text-white" />
            </motion.div>
          )}
          {orbState === "thinking" && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
            />
          )}
          {orbState === "speaking" && <Volume2 className="w-6 h-6 text-white" />}
        </motion.button>

        {/* Close button when active */}
        {isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={handleClose}
            className="absolute -top-1 -right-1 w-5 h-5 bg-zinc-700 rounded-full flex items-center justify-center hover:bg-zinc-600 transition-colors border-0"
          >
            <X className="w-3 h-3 text-white" />
          </motion.button>
        )}
      </div>
    </div>
  );
}
