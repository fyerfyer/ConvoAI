import { create } from 'zustand';
import { UnreadInfo } from '@discord-platform/shared';

interface UnreadState {
  // Unread counts indexed by channelId
  unreadByChannel: Record<string, UnreadInfo>;

  // Actions
  setUnread: (channelId: string, info: UnreadInfo) => void;
  setBulkUnread: (infos: UnreadInfo[]) => void;
  clearUnread: (channelId: string) => void;
  clearAll: () => void;
}

export const useUnreadStore = create<UnreadState>((set) => ({
  unreadByChannel: {},

  setUnread: (channelId, info) =>
    set((state) => ({
      unreadByChannel: {
        ...state.unreadByChannel,
        [channelId]: info,
      },
    })),

  setBulkUnread: (infos) =>
    set((state) => {
      const updated = { ...state.unreadByChannel };
      for (const info of infos) {
        if (info.count > 0) {
          updated[info.channelId] = info;
        } else {
          delete updated[info.channelId];
        }
      }
      return { unreadByChannel: updated };
    }),

  clearUnread: (channelId) =>
    set((state) => {
      const { [channelId]: _, ...rest } = state.unreadByChannel;
      return { unreadByChannel: rest };
    }),

  clearAll: () => set({ unreadByChannel: {} }),
}));
