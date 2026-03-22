'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '@/stores/useUserStore';
import { bootstrapUser } from '@/services/api';

const UserSetupGate = ({ children }: { children: ReactNode }) => {
  const { userId, _hydrated, hydrate, setUserId, setProfile } = useUserStore();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Hydrate from localStorage on mount (safe for SSR)
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // While not yet hydrated, render nothing to avoid flash
  if (!_hydrated) return null;

  // User already set up
  if (userId) return <>{children}</>;

  const handleSubmit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const id = crypto.randomUUID();
    try {
      await bootstrapUser(id, name.trim());
    } catch {
      // Non-critical: continue even if memory save fails
    }
    setUserId(id);
    setProfile({ name: name.trim() });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 rounded-full opacity-40 animate-float" style={{ background: 'radial-gradient(circle, hsl(259 100% 85%) 0%, transparent 70%)' }} />
        <div className="absolute bottom-10 right-10 w-48 h-48 rounded-full opacity-30 animate-float-slow" style={{ background: 'radial-gradient(circle, hsl(22 100% 87%) 0%, transparent 70%)' }} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key="onboarding"
          className="glass-card p-8 sm:p-10 max-w-md w-full mx-4 text-center relative z-10"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          <motion.div className="text-6xl mb-4" animate={{ rotate: [0, -6, 6, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
            🧳
          </motion.div>
          <h2 className="text-2xl font-extrabold font-heading mb-2 text-foreground">Welcome to Planit!</h2>
          <p className="text-muted-foreground text-sm mb-6 font-body">Your AI travel buddy is ready to plan adventures with you ✨</p>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="What's your name?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-5 py-3 rounded-pill bg-muted/50 border border-border text-foreground text-sm font-body placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              autoFocus
            />
            <motion.button
              onClick={handleSubmit}
              className="w-full kawaii-pill bg-primary text-foreground text-sm hover:bg-primary/80 transition-colors"
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              style={{ padding: '0.75rem 1.5rem' }}
              disabled={saving}
            >
              {saving ? 'Setting up…' : "Let's Go! 🚀"}
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default UserSetupGate;
