import { create } from 'zustand';
import { VoiceParticipant } from '@discord-platform/shared';

export interface VoiceState {
  // Currently connected voice channel
  activeChannelId: string | null;
  activeGuildId: string | null;
  // Participants in the current voice channel
  participants: VoiceParticipant[];
  // Local user state
  isMuted: boolean;
  isDeafened: boolean;
  isConnecting: boolean;

  // Actions
  setActiveChannel: (channelId: string | null, guildId: string | null) => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
  addParticipant: (participant: VoiceParticipant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (
    userId: string,
    updates: Partial<VoiceParticipant>,
  ) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  disconnect: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  activeChannelId: null,
  activeGuildId: null,
  participants: [],
  isMuted: false,
  isDeafened: false,
  isConnecting: false,

  setActiveChannel: (channelId, guildId) =>
    set({ activeChannelId: channelId, activeGuildId: guildId }),

  setParticipants: (participants) => set({ participants }),

  addParticipant: (participant) =>
    set((state) => {
      if (state.participants.some((p) => p.userId === participant.userId)) {
        return state;
      }
      return { participants: [...state.participants, participant] };
    }),

  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.userId !== userId),
    })),

  updateParticipant: (userId, updates) =>
    set((state) => ({
      participants: state.participants.map((p) =>
        p.userId === userId ? { ...p, ...updates } : p,
      ),
    })),

  setMuted: (muted) => set({ isMuted: muted }),
  setDeafened: (deafened) => set({ isDeafened: deafened }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),

  disconnect: () =>
    set({
      activeChannelId: null,
      activeGuildId: null,
      participants: [],
      isMuted: false,
      isDeafened: false,
      isConnecting: false,
    }),
}));
