import { create } from 'zustand';

interface UserProfile {
  name: string;
  avatar?: string;
}

interface UserStore {
  userId: string | null;
  profile: UserProfile | null;
  memories: any[];
  accessibility: any | null;
  setUserId: (id: string) => void;
  setProfile: (profile: UserProfile) => void;
  addMemory: (memory: any) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  userId: localStorage.getItem('planit_user_id'),
  profile: JSON.parse(localStorage.getItem('planit_profile') || 'null'),
  memories: [],
  accessibility: null,
  setUserId: (userId) => {
    localStorage.setItem('planit_user_id', userId);
    set({ userId });
  },
  setProfile: (profile) => {
    localStorage.setItem('planit_profile', JSON.stringify(profile));
    set({ profile });
  },
  addMemory: (memory) =>
    set((state) => ({ memories: [...state.memories, memory] })),
}));
