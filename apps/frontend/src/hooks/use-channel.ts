import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import { toast } from './use-toast';
import {
  ApiResponse,
  ChannelResponse,
  ChannelListResponse,
  CreateChannelDTO,
  UpdateChannelDTO,
} from '@discord-platform/shared';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

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
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Create Channel Failed',
        description: getErrorMessage(error, 'Unable to create channel.'),
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
      guildId,
      data,
    }: {
      channelId: string;
      guildId: string;
      data: UpdateChannelDTO;
    }) => {
      const response = await api.patch<ApiResponse<ChannelResponse>>(
        `/channels/${channelId}?guildId=${guildId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelKeys.byGuild(variables.guildId),
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Update Channel Failed',
        description: getErrorMessage(error, 'Unable to update channel.'),
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
      guildId,
    }: {
      channelId: string;
      guildId: string;
    }) => {
      await api.delete<ApiResponse<null>>(
        `/channels/${channelId}?guildId=${guildId}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelKeys.byGuild(variables.guildId),
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Delete Channel Failed',
        description: getErrorMessage(error, 'Unable to delete channel.'),
      });
    },
  });
}
