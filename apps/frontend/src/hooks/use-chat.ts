import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  MessageResponse,
  MessageListResponse,
  PinnedMessagesResponse,
  SearchMessagesResponse,
  CreateMessageDTO,
} from '@discord-platform/shared';

// Chat query keys
export const chatKeys = {
  all: ['messages'] as const,
  byChannel: (channelId: string) =>
    [...chatKeys.all, 'channel', channelId] as const,
  pinned: (channelId: string) =>
    [...chatKeys.all, 'pinned', channelId] as const,
  search: (channelId: string) =>
    [...chatKeys.all, 'search', channelId] as const,
};

// Get messages for a channel
export function useMessages(channelId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: chatKeys.byChannel(channelId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<MessageListResponse>>(
        `/channels/${channelId}/messages?limit=50`,
      );
      return response.data?.messages ?? [];
    },
    enabled: isAuthenticated && !!channelId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Send a message via REST API
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateMessageDTO) => {
      const response = await api.post<ApiResponse<MessageResponse>>(
        `/channels/${dto.channelId}/messages`,
        dto,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.byChannel(variables.channelId),
      });
    },
  });
}

// Load older messages (before a specific message ID)
export function useLoadOlderMessages() {
  return useMutation({
    mutationFn: async ({
      channelId,
      beforeId,
      limit = 50,
    }: {
      channelId: string;
      beforeId: string;
      limit?: number;
    }) => {
      const response = await api.get<ApiResponse<MessageListResponse>>(
        `/channels/${channelId}/messages?limit=${limit}&beforeId=${beforeId}`,
      );
      return response.data?.messages ?? [];
    },
  });
}

// Pinned Messages
export function usePinnedMessages(channelId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: chatKeys.pinned(channelId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<PinnedMessagesResponse>>(
        `/channels/${channelId}/messages/pins`,
      );
      return response.data;
    },
    enabled: isAuthenticated && !!channelId,
    staleTime: 30 * 1000,
  });
}

export function usePinMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      messageId,
    }: {
      channelId: string;
      messageId: string;
    }) => {
      const response = await api.put<ApiResponse<MessageResponse>>(
        `/channels/${channelId}/messages/pins/${messageId}`,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.pinned(variables.channelId),
      });
      queryClient.invalidateQueries({
        queryKey: chatKeys.byChannel(variables.channelId),
      });
    },
  });
}

export function useUnpinMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      messageId,
    }: {
      channelId: string;
      messageId: string;
    }) => {
      const response = await api.delete<ApiResponse<MessageResponse>>(
        `/channels/${channelId}/messages/pins/${messageId}`,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.pinned(variables.channelId),
      });
      queryClient.invalidateQueries({
        queryKey: chatKeys.byChannel(variables.channelId),
      });
    },
  });
}

// ── Message Search ──

export function useSearchMessages() {
  return useMutation({
    mutationFn: async ({
      channelId,
      query,
      mode = 'keyword',
      authorId,
      before,
      after,
      limit = 25,
      offset = 0,
    }: {
      channelId: string;
      query: string;
      mode?: string;
      authorId?: string;
      before?: string;
      after?: string;
      limit?: number;
      offset?: number;
    }) => {
      const params = new URLSearchParams({ query, mode });
      if (authorId) params.set('authorId', authorId);
      if (before) params.set('before', before);
      if (after) params.set('after', after);
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));

      const response = await api.get<ApiResponse<SearchMessagesResponse>>(
        `/channels/${channelId}/messages/search?${params.toString()}`,
      );
      return response.data;
    },
  });
}
