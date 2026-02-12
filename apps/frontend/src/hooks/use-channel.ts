import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  ChannelResponse,
  ChannelListResponse,
  CreateChannelDTO,
  UpdateChannelDTO,
} from '@discord-platform/shared';

// Channel query keys
export const channelKeys = {
  all: ['channels'] as const,
  byGuild: (guildId: string) => [...channelKeys.all, 'guild', guildId] as const,
  detail: (channelId: string) =>
    [...channelKeys.all, 'detail', channelId] as const,
};

// Get channels
export function useChannels(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: channelKeys.byGuild(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<ChannelListResponse>>(
        `/guilds/${guildId}/channels`,
      );
      return response.data?.channels ?? [];
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Create channel
export function useCreateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      data,
    }: {
      guildId: string;
      data: CreateChannelDTO;
    }) => {
      const response = await api.post<ApiResponse<ChannelResponse>>(
        `/channels?guildId=${guildId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelKeys.byGuild(variables.guildId),
      });
    },
  });
}

// Update channel
export function useUpdateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      data,
    }: {
      channelId: string;
      guildId: string;
      data: UpdateChannelDTO;
    }) => {
      const response = await api.patch<ApiResponse<ChannelResponse>>(
        `/channels/${channelId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelKeys.byGuild(variables.guildId),
      });
    },
  });
}

// Delete channel
export function useDeleteChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
    }: {
      channelId: string;
      guildId: string;
    }) => {
      await api.delete<ApiResponse<null>>(`/channels/${channelId}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelKeys.byGuild(variables.guildId),
      });
    },
  });
}
