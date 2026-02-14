'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { chatKeys } from './use-chat';
import {
  CreateMessageDTO,
  MessageResponse,
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

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [token, addMessage, setTypingUser, removeTypingUser, queryClient]);

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

  return {
    socket: socketRef.current,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    isConnected,
  };
}
