import { create } from 'zustand';

interface UIState {
  // Sidebar states
  guildSidebarCollapsed: boolean;
  channelSidebarCollapsed: boolean;

  // Modal states
  profileEditOpen: boolean;
  createGuildOpen: boolean;

  // Actions
  toggleGuildSidebar: () => void;
  toggleChannelSidebar: () => void;
  setProfileEditOpen: (open: boolean) => void;
  setCreateGuildOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial states
  guildSidebarCollapsed: false,
  channelSidebarCollapsed: false,
  profileEditOpen: false,
  createGuildOpen: false,

  // Actions
  toggleGuildSidebar: () =>
    set((state) => ({ guildSidebarCollapsed: !state.guildSidebarCollapsed })),

  toggleChannelSidebar: () =>
    set((state) => ({
      channelSidebarCollapsed: !state.channelSidebarCollapsed,
    })),

  setProfileEditOpen: (open) => set({ profileEditOpen: open }),

  setCreateGuildOpen: (open) => set({ createGuildOpen: open }),
}));
