import { create } from 'zustand';
import { MessageResponse } from '@discord-platform/shared';

interface ChatState {
  // Messages indexed by channelId
  messagesByChannel: Record<string, MessageResponse[]>;
  // Currently viewed channel
  currentChannelId: string | null;
  // Typing users by channelId
  typingUsers: Record<string, string[]>;

  // Actions
  setCurrentChannel: (channelId: string | null) => void;
  setMessages: (channelId: string, messages: MessageResponse[]) => void;
  addMessage: (message: MessageResponse) => void;
  prependMessages: (channelId: string, messages: MessageResponse[]) => void;
  setTypingUser: (channelId: string, userId: string) => void;
  removeTypingUser: (channelId: string, userId: string) => void;
  clearChannel: (channelId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByChannel: {},
  currentChannelId: null,
  typingUsers: {},

  setCurrentChannel: (channelId) => set({ currentChannelId: channelId }),

  setMessages: (channelId, messages) =>
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: messages,
      },
    })),

  addMessage: (message) =>
    set((state) => {
      const channelId = message.channelId;
      const existing = state.messagesByChannel[channelId] ?? [];
      // Avoid duplicates by checking id
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...existing, message],
        },
      };
    }),

  prependMessages: (channelId, messages) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] ?? [];
      const existingIds = new Set(existing.map((m) => m.id));
      const newMessages = messages.filter((m) => !existingIds.has(m.id));
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...newMessages, ...existing],
        },
      };
    }),

  setTypingUser: (channelId, userId) =>
    set((state) => {
      const current = state.typingUsers[channelId] ?? [];
      if (current.includes(userId)) return state;
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: [...current, userId],
        },
      };
    }),

  removeTypingUser: (channelId, userId) =>
    set((state) => {
      const current = state.typingUsers[channelId] ?? [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: current.filter((id) => id !== userId),
        },
      };
    }),

  clearChannel: (channelId) =>
    set((state) => {
      const { [channelId]: _, ...rest } = state.messagesByChannel;
      return { messagesByChannel: rest };
    }),
}));
