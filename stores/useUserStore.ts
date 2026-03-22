'use client';

import { create } from 'zustand';

interface UserProfile {
  name: string;
  avatar?: string;
}

interface UserStore {
  userId: string | null;
  profile: UserProfile | null;
  memories: unknown[];
  accessibility: unknown | null;
  _hydrated: boolean;
  setUserId: (id: string) => void;
  setProfile: (profile: UserProfile) => void;
  addMemory: (memory: unknown) => void;
  hydrate: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  userId: null,
  profile: null,
  memories: [],
  accessibility: null,
  _hydrated: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const userId = localStorage.getItem('planit_user_id');
    const profileRaw = localStorage.getItem('planit_profile');
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    set({ userId, profile, _hydrated: true });
  },
  setUserId: (userId) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('planit_user_id', userId);
    }
    set({ userId });
  },
  setProfile: (profile) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('planit_profile', JSON.stringify(profile));
    }
    set({ profile });
  },
  addMemory: (memory) =>
    set((state) => ({ memories: [...state.memories, memory] })),
}));
