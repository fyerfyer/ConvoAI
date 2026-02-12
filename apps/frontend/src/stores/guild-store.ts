import { create } from 'zustand';
import { GuildResponse, ChannelResponse } from '@discord-platform/shared';

interface GuildState {
  // Active selections
  activeGuild: GuildResponse | null;
  activeChannel: ChannelResponse | null;

  // Actions
  setActiveGuild: (guild: GuildResponse | null) => void;
  setActiveChannel: (channel: ChannelResponse | null) => void;
  clearActive: () => void;
}

export const useGuildStore = create<GuildState>((set) => ({
  activeGuild: null,
  activeChannel: null,

  setActiveGuild: (guild) =>
    set({
      activeGuild: guild,
      activeChannel: null, // Reset channel when switching guilds
    }),

  setActiveChannel: (channel) => set({ activeChannel: channel }),

  clearActive: () =>
    set({
      activeGuild: null,
      activeChannel: null,
    }),
}));
