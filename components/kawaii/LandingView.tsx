'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface LandingViewProps {
  userName?: string;
  onStart: () => void;
}

const LandingView = ({ userName, onStart }: LandingViewProps) => {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/hero-travel.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-black/5" />

      <motion.div
        className="relative z-10 flex flex-col items-center text-center gap-4"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.p
          className="text-sm font-body tracking-widest uppercase text-foreground/60"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          welcome back
        </motion.p>

        <motion.h1
          className="text-5xl sm:text-6xl font-heading font-bold text-foreground"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.55 }}
        >
          Hi, {userName ?? 'Traveller'}
        </motion.h1>

        <motion.p
          className="text-lg font-body text-foreground/70"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          Where to next?
        </motion.p>

        <motion.button
          onClick={onStart}
          className="mt-2 flex items-center gap-2 px-7 py-3 rounded-full font-body font-semibold text-sm text-background bg-foreground shadow-pastel hover:shadow-pastel-hover transition-shadow"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.45, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
        >
          <Sparkles className="w-4 h-4" />
          Plan a Trip
        </motion.button>
      </motion.div>
    </div>
  );
};

export default LandingView;
