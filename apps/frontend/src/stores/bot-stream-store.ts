import { create } from 'zustand';

export interface BotStreamState {
  activeStreams: Record<
    string,
    {
      botId: string;
      channelId: string;
      content: string;
      startedAt: number;
    }
  >;

  /** Start tracking a new bot stream */
  startStream: (streamId: string, botId: string, channelId: string) => void;

  /** Append a chunk of content to an active stream */
  appendChunk: (streamId: string, content: string) => void;

  /** Mark a stream as finished and remove it */
  endStream: (streamId: string) => void;

  /** Get all active streams for a specific channel */
  getChannelStreams: (channelId: string) => Array<{
    streamId: string;
    botId: string;
    content: string;
  }>;

  /** Clear all streams (e.g. on disconnect) */
  clearAll: () => void;
}

export const useBotStreamStore = create<BotStreamState>((set, get) => ({
  activeStreams: {},

  startStream: (streamId, botId, channelId) =>
    set((state) => ({
      activeStreams: {
        ...state.activeStreams,
        [streamId]: {
          botId,
          channelId,
          content: '',
          startedAt: Date.now(),
        },
      },
    })),

  appendChunk: (streamId, content) =>
    set((state) => {
      const stream = state.activeStreams[streamId];
      if (!stream) return state;
      return {
        activeStreams: {
          ...state.activeStreams,
          [streamId]: {
            ...stream,
            content: stream.content + content,
          },
        },
      };
    }),

  endStream: (streamId) =>
    set((state) => {
      const { [streamId]: _, ...rest } = state.activeStreams;
      return { activeStreams: rest };
    }),

  getChannelStreams: (channelId) => {
    const streams = get().activeStreams;
    return Object.entries(streams)
      .filter(([, s]) => s.channelId === channelId)
      .map(([streamId, s]) => ({
        streamId,
        botId: s.botId,
        content: s.content,
      }));
  },

  clearAll: () => set({ activeStreams: {} }),
}));
