'use client';

import { MessageCircle, Map, Brain, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserStore } from '@/stores/useUserStore';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const navItems = [
  { icon: MessageCircle, label: 'Chat' },
  { icon: Map, label: 'My Trips' },
  { icon: Brain, label: 'Memories' },
  { icon: Settings, label: 'Settings' },
];

const NavigationSidebar = () => {
  const profile = useUserStore((s) => s.profile);
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside
        className="hidden md:flex flex-col items-center w-16 h-screen fixed left-0 top-0 z-30 py-6 gap-2"
        style={{ background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(20px)' }}
      >
        <motion.div
          className="w-9 h-9 rounded-full bg-primary flex items-center justify-center font-heading font-extrabold text-foreground text-xs mb-6 cursor-pointer"
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.94 }}
          title="Planit"
        >
          P
        </motion.div>
        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map((item, i) => (
            <motion.button
              key={item.label}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${i === 0 ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}`}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
              title={item.label}
            >
              <item.icon className="w-[18px] h-[18px]" />
            </motion.button>
          ))}
        </nav>
        <motion.div
          className="w-9 h-9 rounded-full bg-primary/40 flex items-center justify-center font-heading font-bold text-foreground text-xs cursor-pointer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.4 }}
          whileHover={{ scale: 1.1 }}
          title={profile?.name ?? 'Profile'}
        >
          {profile?.name?.[0]?.toUpperCase() ?? '?'}
        </motion.div>
      </aside>

      <motion.button
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-full flex items-center justify-center text-foreground"
        style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-pastel)' }}
        onClick={() => setOpen(!open)}
        whileTap={{ scale: 0.9 }}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </motion.button>

      {open && (
        <motion.div
          className="md:hidden fixed inset-0 z-40"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <motion.nav
            className="absolute left-4 top-16 glass-card p-3 w-56 space-y-1"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map((item, i) => (
              <button key={item.label} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold font-body transition-colors ${i === 0 ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-foreground/5'}`}>
                <item.icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="border-t border-border/50 my-2" />
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-primary/40 flex items-center justify-center font-heading font-bold text-foreground text-xs">
                {profile?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-sm font-semibold font-heading">{profile?.name ?? 'Traveler'}</span>
            </div>
          </motion.nav>
        </motion.div>
      )}
    </>
  );
};

export default NavigationSidebar;
