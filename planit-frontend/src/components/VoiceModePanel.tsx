import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const WaveBar = ({ delay }: { delay: number }) => {
  return (
    <motion.div
      className="w-1 rounded-full bg-primary"
      animate={{
        height: ['12px', '32px', '18px', '28px', '12px'],
      }}
      transition={{
        repeat: Infinity,
        duration: 1.2,
        delay,
        ease: 'easeInOut',
      }}
    />
  );
};

const VoiceModePanel = ({ isOpen, onClose }: Props) => {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setListening(true);
      setTranscript('');
      // Simulated transcript for demo
      const timer = setTimeout(() => {
        setTranscript('I want to visit temples in Kyoto...');
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setListening(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed bottom-0 left-0 md:left-16 right-0 z-50"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
          >
            <div
              className="glass-card mx-4 mb-4 p-6 space-y-5"
              style={{ borderRadius: '24px' }}
            >
              {/* Close */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-8 h-8 rounded-full bg-accent flex items-center justify-center"
                    animate={{ scale: listening ? [1, 1.15, 1] : 1 }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <Mic className="w-4 h-4 text-foreground" />
                  </motion.div>
                  <span className="text-sm font-bold font-heading">
                    {listening ? 'Listening...' : 'Voice Mode'}
                  </span>
                </div>
                <motion.button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Waveform */}
              <div className="flex items-center justify-center gap-1.5 h-16">
                {Array.from({ length: 16 }).map((_, i) => (
                  <WaveBar key={i} delay={i * 0.07} />
                ))}
              </div>

              {/* Live transcript */}
              <div className="min-h-[40px]">
                <AnimatePresence mode="wait">
                  {transcript ? (
                    <motion.p
                      key="transcript"
                      className="text-sm font-body text-center text-foreground"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      "{transcript}"
                    </motion.p>
                  ) : (
                    <motion.p
                      key="placeholder"
                      className="text-xs font-body text-center text-muted-foreground"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.6 }}
                    >
                      Speak naturally — I'll understand ✨
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Breathing ring */}
              <div className="flex justify-center">
                <motion.div
                  className="w-20 h-20 rounded-full border-[3px] border-primary/40 flex items-center justify-center"
                  animate={{
                    scale: [1, 1.08, 1],
                    borderColor: ['hsl(259 100% 85% / 0.4)', 'hsl(259 100% 85% / 0.7)', 'hsl(259 100% 85% / 0.4)'],
                  }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                >
                  <motion.div
                    className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', delay: 0.15 }}
                  >
                    <Mic className="w-6 h-6 text-foreground" />
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default VoiceModePanel;
