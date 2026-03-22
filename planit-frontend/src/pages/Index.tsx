import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import heroImage from '@/assets/hero-travel.jpg';
import { useUserStore } from '@/stores/useUserStore';
import AppShell from '@/components/AppShell';
import ChatInterface from '@/components/ChatInterface';
import { useState } from 'react';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

const Index = () => {
  const profile = useUserStore((s) => s.profile);
  const [showChat, setShowChat] = useState(false);

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        {!showChat ? (
          <motion.div
            key="landing"
            className="relative min-h-screen flex items-center justify-center overflow-hidden"
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Background */}
            <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, hsla(30,60%,98%,0.55) 0%, hsla(30,60%,98%,0.75) 100%)' }} />

            <div className="relative z-10 text-center px-6 max-w-lg">
              <motion.p
                className="text-sm font-body text-muted-foreground mb-2 tracking-wide"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                welcome back
              </motion.p>
              <motion.h1
                className="text-4xl sm:text-5xl font-extrabold font-heading leading-[1.1] mb-3"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, ...spring }}
              >
                Hi, {profile?.name || 'Traveler'}
              </motion.h1>
              <motion.p
                className="text-lg sm:text-xl font-heading font-semibold text-muted-foreground mb-8"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, ...spring }}
              >
                Where to next?
              </motion.p>
              <motion.button
                onClick={() => setShowChat(true)}
                className="kawaii-pill bg-foreground text-background text-sm inline-flex items-center gap-2 shadow-pastel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, ...spring }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
              >
                <Sparkles className="w-4 h-4" />
                Plan a Trip
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            className="min-h-screen"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            <ChatInterface />
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
};

export default Index;
