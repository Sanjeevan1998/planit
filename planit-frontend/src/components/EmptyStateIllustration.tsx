import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

interface Props {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyStateIllustration = ({
  title = 'Nothing here yet',
  message = 'Start planning your next adventure!',
  actionLabel,
  onAction,
}: Props) => {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      {/* Kawaii cloud creature */}
      <motion.div
        className="relative mb-6"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      >
        <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
          {/* Cloud body */}
          <ellipse cx="60" cy="58" rx="42" ry="30" fill="hsl(259 100% 85% / 0.3)" />
          <ellipse cx="38" cy="50" rx="24" ry="20" fill="hsl(259 100% 85% / 0.25)" />
          <ellipse cx="82" cy="50" rx="24" ry="20" fill="hsl(259 100% 85% / 0.25)" />
          <ellipse cx="60" cy="42" rx="28" ry="22" fill="hsl(259 100% 85% / 0.35)" />

          {/* Eyes */}
          <circle cx="50" cy="52" r="3" fill="hsl(270 28% 23%)" />
          <circle cx="70" cy="52" r="3" fill="hsl(270 28% 23%)" />
          {/* Eye shines */}
          <circle cx="51.5" cy="50.5" r="1" fill="white" />
          <circle cx="71.5" cy="50.5" r="1" fill="white" />

          {/* Blush */}
          <ellipse cx="42" cy="58" rx="5" ry="3" fill="hsl(340 100% 86% / 0.5)" />
          <ellipse cx="78" cy="58" rx="5" ry="3" fill="hsl(340 100% 86% / 0.5)" />

          {/* Smile */}
          <path d="M55 60 Q60 66 65 60" stroke="hsl(270 28% 23%)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

          {/* Tiny sparkles */}
          <motion.circle
            cx="22" cy="30" r="2"
            fill="hsl(44 100% 75%)"
            animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 2, delay: 0 }}
          />
          <motion.circle
            cx="100" cy="25" r="1.5"
            fill="hsl(340 100% 86%)"
            animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 2, delay: 0.7 }}
          />
          <motion.circle
            cx="90" cy="75" r="2"
            fill="hsl(153 62% 83%)"
            animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 2, delay: 1.3 }}
          />
        </svg>
      </motion.div>

      <h3 className="text-lg font-extrabold font-heading mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground font-body max-w-xs mb-5">{message}</p>

      {actionLabel && onAction && (
        <motion.button
          onClick={onAction}
          className="kawaii-pill bg-foreground text-background text-sm"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
};

export default EmptyStateIllustration;
