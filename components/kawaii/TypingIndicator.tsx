'use client';

import { motion } from 'framer-motion';

const TypingIndicator = () => (
  <div className="flex items-start gap-2 px-4">
    <div className="glass-card px-4 py-3 flex items-center gap-1.5" style={{ borderRadius: '20px 20px 20px 4px' }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-primary"
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  </div>
);

export default TypingIndicator;
