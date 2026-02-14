import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  MessageResponse,
  MessageListResponse,
  CreateMessageDTO,
} from '@discord-platform/shared';

// Chat query keys
export const chatKeys = {
  all: ['messages'] as const,
  byChannel: (channelId: string) =>
    [...chatKeys.all, 'channel', channelId] as const,
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
