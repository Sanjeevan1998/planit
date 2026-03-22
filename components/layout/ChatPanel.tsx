"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatResponse } from "@/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: ChatResponse;
}

interface ChatPanelProps {
  userId: string;
  itineraryId?: string;
  onItineraryUpdate?: (update: ChatResponse) => void;
  className?: string;
}

export function ChatPanel({
  userId,
  itineraryId,
  onItineraryUpdate,
  className,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hey! I'm Planit, your AI travel sidekick. Tell me about your trip — where are you going, and what matters most to you? (Accessibility needs, budget, vibe — all welcome!)",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text?: string) => {
    const message = (text || input).trim();
    if (!message || isLoading) return;

    setInput("");
    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          user_id: userId,
          itinerary_id: itineraryId,
        }),
      });

      const data: ChatResponse = await res.json();

      const assistantMsg: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: data.response || "Let me think about that...",
        timestamp: new Date(),
        metadata: data,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.itinerary_update || data.new_nodes?.length || data.transport_options?.length) {
        onItineraryUpdate?.(data);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          role: "assistant",
          content: "Hmm, something went wrong. Give it another try!",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const suggestions = [
    "Plan my Saturday in Tokyo",
    "I need elevator access everywhere",
    "Find a quiet café nearby",
    "How do I get to Shinjuku?",
  ];

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-3",
              msg.role === "user" && "flex-row-reverse"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1",
                msg.role === "assistant"
                  ? "bg-gradient-to-br from-violet-600 to-indigo-700"
                  : "bg-zinc-700"
              )}
            >
              {msg.role === "assistant" ? (
                <Sparkles className="w-3.5 h-3.5 text-white" />
              ) : (
                <User className="w-3.5 h-3.5 text-zinc-300" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "assistant"
                  ? "bg-zinc-800/70 text-zinc-100 rounded-tl-sm"
                  : "bg-violet-600 text-white rounded-tr-sm"
              )}
            >
              {msg.content}

              {/* Transport options inline */}
              {msg.metadata?.transport_options?.length && (
                <div className="mt-3 space-y-1.5 border-t border-zinc-700 pt-3">
                  {msg.metadata.transport_options.slice(0, 3).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span>
                        {opt.mode === "train"
                          ? "🚇"
                          : opt.mode === "uber"
                          ? "🚗"
                          : opt.mode === "walk"
                          ? "🚶"
                          : "🚌"}
                      </span>
                      <span className="text-zinc-300">{opt.label}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">{opt.duration_minutes}min</span>
                      {opt.booking_link && (
                        <a
                          href={opt.booking_link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-400 hover:text-violet-300 ml-auto"
                        >
                          {opt.booking_link.platform} ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Loading indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex gap-3"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shrink-0 mt-1">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-zinc-800/70 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions (shown when few messages) */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-zinc-800">
        <div className="flex gap-2 items-center bg-zinc-800/60 border border-zinc-700 rounded-2xl px-4 py-2 focus-within:border-violet-500/60 transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask Planit anything..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
