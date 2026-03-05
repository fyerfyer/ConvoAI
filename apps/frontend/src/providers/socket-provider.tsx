'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { useBotStreamStore } from '../stores/bot-stream-store';
import { useUnreadStore } from '../stores/unread-store';
import { chatKeys } from '../hooks/use-chat';
import { unreadKeys } from '../hooks/use-unread';
import { permissionKeys } from '../hooks/use-permission';
import { channelKeys } from '../hooks/use-channel';
import {
  CreateMessageDTO,
  MessageResponse,
  BotStreamStartPayload,
  BotStreamChunkPayload,
  UnreadUpdatePayload,
  SOCKET_EVENT,
} from '@discord-platform/shared';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';
const HEARTBEAT_INTERVAL = 25000;

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  joinRoom: (channelId: string) => void;
  leaveRoom: (channelId: string) => void;
  sendMessage: (payload: CreateMessageDTO) => void;
  sendTyping: (channelId: string, isTyping: boolean) => void;
  markRead: (channelId: string) => void;
}

const noop = () => {
  /* empty */
};

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  joinRoom: noop,
  leaveRoom: noop,
  sendMessage: noop,
  sendTyping: noop,
  markRead: noop,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRoomsRef = useRef<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  // Initialize and connect socket
  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setIsConnected(true);

      // Rejoin all pending rooms on connect/reconnect
      pendingRoomsRef.current.forEach((roomId) => {
        socket.emit(SOCKET_EVENT.JOIN_ROOM, roomId);
      });

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        socket.emit(SOCKET_EVENT.HEARTBEAT);
      }, HEARTBEAT_INTERVAL);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    });

    // Listen for new messages
    socket.on(SOCKET_EVENT.NEW_MESSAGE, (message: MessageResponse) => {
      useChatStore.getState().addMessage(message);
      queryClient.invalidateQueries({
        queryKey: chatKeys.byChannel(message.channelId),
      });
    });

    // Listen for typing events
    socket.on(
      SOCKET_EVENT.TYPING,
      (data: { userId: string; channelId: string; isTyping: boolean }) => {
        if (data.isTyping) {
          useChatStore.getState().setTypingUser(data.channelId, data.userId);
        } else {
          useChatStore.getState().removeTypingUser(data.channelId, data.userId);
        }
      },
    );

    // Bot streaming events
    socket.on(SOCKET_EVENT.BOT_STREAM_START, (data: BotStreamStartPayload) => {
      useBotStreamStore
        .getState()
        .startStream(data.streamId, data.botId, data.channelId);
    });

    socket.on(SOCKET_EVENT.BOT_STREAM_CHUNK, (data: BotStreamChunkPayload) => {
      const streams = useBotStreamStore.getState().activeStreams;
      const entry = Object.entries(streams).find(
        ([, s]) => s.botId === data.botId && s.channelId === data.channelId,
      );
      if (entry) {
        useBotStreamStore.getState().appendChunk(entry[0], data.content);
      }
    });

    socket.on(SOCKET_EVENT.BOT_STREAM_END, (data: BotStreamChunkPayload) => {
      const streams = useBotStreamStore.getState().activeStreams;
      const entry = Object.entries(streams).find(
        ([, s]) => s.botId === data.botId && s.channelId === data.channelId,
      );
      if (entry) {
        useBotStreamStore.getState().endStream(entry[0]);
      }
    });

    // Unread update events
    socket.on(SOCKET_EVENT.UNREAD_UPDATE, (data: UnreadUpdatePayload) => {
      // Only update unread if user is not currently viewing this channel
      const currentChannel = useChatStore.getState().currentChannelId;
      if (currentChannel !== data.channelId) {
        useUnreadStore.getState().setUnread(data.channelId, {
          channelId: data.channelId,
          count: data.count,
          lastMessageId: data.lastMessageId,
          lastMessageAt: data.lastMessageAt,
        });

        // Also update the React Query cache so the Guild badge updates instantly
        if (data.guildId) {
          queryClient.setQueryData(
            unreadKeys.byGuild(data.guildId),
            (old: Array<{ channelId: string; count: number }> | undefined) => {
              if (!old)
                return [{ channelId: data.channelId, count: data.count }];
              const existing = old.find((c) => c.channelId === data.channelId);
              if (existing) {
                return old.map((c) =>
                  c.channelId === data.channelId
                    ? { ...c, count: data.count }
                    : c,
                );
              }
              return [...old, { channelId: data.channelId, count: data.count }];
            },
          );
        }
      }
    });

    // Permission updates
    socket.on(SOCKET_EVENT.PERMISSIONS_UPDATE, (data: { guildId: string }) => {
      if (data.guildId) {
        queryClient.invalidateQueries({
          queryKey: permissionKeys.byGuild(data.guildId),
        });
        queryClient.invalidateQueries({
          queryKey: channelKeys.byGuild(data.guildId),
        });
        queryClient.invalidateQueries({ queryKey: chatKeys.all });
      }
    });

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [token, queryClient]);

  // Join a channel room
  const joinRoom = useCallback((channelId: string) => {
    pendingRoomsRef.current.add(channelId);
    if (socketRef.current?.connected) {
      socketRef.current.emit(SOCKET_EVENT.JOIN_ROOM, channelId);
    }
  }, []);

  // Leave a channel room
  const leaveRoom = useCallback((channelId: string) => {
    pendingRoomsRef.current.delete(channelId);
    if (socketRef.current?.connected) {
      socketRef.current.emit(SOCKET_EVENT.LEAVE_ROOM, channelId);
    }
  }, []);

  // Send a message via WebSocket
  const sendMessage = useCallback((payload: CreateMessageDTO) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(SOCKET_EVENT.SEND_MESSAGE, payload);
    }
  }, []);

  // Send typing indicator
  const sendTyping = useCallback((channelId: string, isTyping: boolean) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(SOCKET_EVENT.TYPING, { channelId, isTyping });
    }
  }, []);

  // Mark channel as read via socket
  const markRead = useCallback((channelId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(SOCKET_EVENT.MARK_READ, { channelId });
    }
    // Immediately clear locally
    useUnreadStore.getState().clearUnread(channelId);
  }, []);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      isConnected,
      joinRoom,
      leaveRoom,
      sendMessage,
      sendTyping,
      markRead,
    }),
    [isConnected, joinRoom, leaveRoom, sendMessage, sendTyping, markRead],
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
