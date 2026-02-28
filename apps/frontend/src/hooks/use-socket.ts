'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { useBotStreamStore } from '../stores/bot-stream-store';
import { useUnreadStore } from '../stores/unread-store';
import { chatKeys } from './use-chat';
import {
  CreateMessageDTO,
  MessageResponse,
  BotStreamStartPayload,
  BotStreamChunkPayload,
  UnreadUpdatePayload,
  SOCKET_EVENT,
} from '@discord-platform/shared';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';
const HEARTBEAT_INTERVAL = 25000; // 25 seconds

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRoomsRef = useRef<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const { addMessage, setTypingUser, removeTypingUser } = useChatStore();
  const { startStream, appendChunk, endStream, clearAll } = useBotStreamStore();
  const setUnread = useUnreadStore((state) => state.setUnread);

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
      addMessage(message);
      // Also invalidate query cache so re-fetches are fresh
      queryClient.invalidateQueries({
        queryKey: chatKeys.byChannel(message.channelId),
      });
    });

    // Listen for typing events
    socket.on(
      SOCKET_EVENT.TYPING,
      (data: { userId: string; channelId: string; isTyping: boolean }) => {
        if (data.isTyping) {
          setTypingUser(data.channelId, data.userId);
        } else {
          removeTypingUser(data.channelId, data.userId);
        }
      },
    );

    // Bot streaming events
    socket.on(SOCKET_EVENT.BOT_STREAM_START, (data: BotStreamStartPayload) => {
      startStream(data.streamId, data.botId, data.channelId);
    });

    socket.on(SOCKET_EVENT.BOT_STREAM_CHUNK, (data: BotStreamChunkPayload) => {
      // Find active stream for this bot+channel
      const streams = useBotStreamStore.getState().activeStreams;
      const entry = Object.entries(streams).find(
        ([, s]) => s.botId === data.botId && s.channelId === data.channelId,
      );
      if (entry) {
        appendChunk(entry[0], data.content);
      }
    });

    socket.on(SOCKET_EVENT.BOT_STREAM_END, (data: BotStreamChunkPayload) => {
      const streams = useBotStreamStore.getState().activeStreams;
      const entry = Object.entries(streams).find(
        ([, s]) => s.botId === data.botId && s.channelId === data.channelId,
      );
      if (entry) {
        endStream(entry[0]);
      }
    });

    // Unread update events
    socket.on(SOCKET_EVENT.UNREAD_UPDATE, (data: UnreadUpdatePayload) => {
      // Only increment unread if user is not currently viewing this channel
      const currentChannel = useChatStore.getState().currentChannelId;
      if (currentChannel !== data.channelId) {
        useUnreadStore.getState().setUnread(data.channelId, {
          channelId: data.channelId,
          count: data.count,
          lastMessageId: data.lastMessageId,
          lastMessageAt: data.lastMessageAt,
        });
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
  }, [
    token,
    addMessage,
    setTypingUser,
    removeTypingUser,
    queryClient,
    startStream,
    appendChunk,
    endStream,
    clearAll,
    setUnread,
  ]);

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

  return {
    socket: socketRef.current,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    markRead,
    isConnected,
  };
}
