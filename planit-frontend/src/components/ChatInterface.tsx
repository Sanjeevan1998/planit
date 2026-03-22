import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, MicOff } from 'lucide-react';
import { useChatStore } from '@/stores/useChatStore';
import { useTripStore } from '@/stores/useTripStore';
import { useUserStore } from '@/stores/useUserStore';
import { sendChatMessage } from '@/services/chatApi';
import TypingIndicator from './TypingIndicator';
import ActivitySelectionView from './ActivitySelectionView';
import ItineraryDashboard from './ItineraryDashboard';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

const ChatInterface = () => {
  const { messages, isLoading, addMessage, setLoading } = useChatStore();
  const { planningStep, setPlanningStep, suggestions, setSuggestions, itinerary } = useTripStore();
  const userId = useUserStore((s) => s.userId);
  const profile = useUserStore((s) => s.profile);

  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasGreeted = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (!hasGreeted.current && messages.length === 0) {
      hasGreeted.current = true;
      setTimeout(() => {
        addMessage({
          role: 'assistant',
          content: `Hey ${profile?.name || 'there'}! 🌸 Ready to plan your next adventure? Tell me — where in the world do you want to go?`,
        });
      }, 600);
    }
  }, [addMessage, messages.length, profile?.name]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    addMessage({ role: 'user', content: text });
    setLoading(true);

    try {
      const result = await sendChatMessage(text, userId || '');
      addMessage({ role: 'assistant', content: result.response });

      if (result.mode === 'suggest' && result.tripSuggestions) {
        setSuggestions(result.tripSuggestions);
        setTimeout(() => setPlanningStep('review'), 1500);
      }
    } catch {
      addMessage({ role: 'assistant', content: "Oops, something went wrong! 😅 Let's try that again." });
    } finally {
      setLoading(false);
    }
  }, [input, isLoading, userId, addMessage, setLoading, setSuggestions, setPlanningStep]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  // Show itinerary dashboard
  if (planningStep === 'finalize' && itinerary) {
    return <ItineraryDashboard itinerary={itinerary} />;
  }

  // Show activity selection
  if (planningStep === 'review' && suggestions) {
    return <ActivitySelectionView suggestions={suggestions} />;
  }

  return (
    <motion.div
      className="flex flex-col h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Chat header */}
      <motion.div
        className="px-4 sm:px-6 pt-6 pb-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, ...spring }}
      >
        <h2 className="text-lg font-bold font-heading">Plan Your Trip</h2>
        <p className="text-xs text-muted-foreground font-body">Tell me everything — I'll handle the rest ✨</p>
      </motion.div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 space-y-3 pb-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={spring}
              layout
            >
              <div
                className={`max-w-[80%] sm:max-w-[70%] px-4 py-3 text-sm font-body leading-relaxed text-foreground`}
                style={{
                  borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  background: msg.role === 'user'
                    ? 'hsl(259 100% 85% / 0.4)'
                    : 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid hsl(259 60% 92%)',
                  boxShadow: '0 4px 16px rgba(201, 184, 255, 0.12)',
                }}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <TypingIndicator />
          </motion.div>
        )}
      </div>

      {/* Input bar */}
      <motion.div
        className="p-4 sm:px-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, ...spring }}
      >
        <div className="glass-card flex items-center gap-2 px-4 py-2" style={{ borderRadius: '999px' }}>
          <motion.button
            onClick={toggleRecording}
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              isRecording ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </motion.button>

          <input
            ref={inputRef}
            type="text"
            placeholder="Tell me about your dream trip..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-transparent text-sm font-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none py-2"
            disabled={isLoading}
          />

          <motion.button
            onClick={handleSend}
            className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center flex-shrink-0"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{ opacity: input.trim() ? 1 : 0.3 }}
            disabled={!input.trim() || isLoading}
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ChatInterface;
