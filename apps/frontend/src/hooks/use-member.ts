import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  MemberResponse,
  MemberListResponse,
} from '@discord-platform/shared';

// Member query keys
export const memberKeys = {
  all: ['members'] as const,
  byGuild: (guildId: string) => [...memberKeys.all, 'guild', guildId] as const,
};

// Get members
export function useMembers(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: memberKeys.byGuild(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<MemberListResponse>>(
        `/guilds/${guildId}/members`,
      );
      return response.data?.members ?? [];
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 2 * 60 * 1000,
  });
}

// Update nickname
export function useUpdateNickname() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      nickName,
    }: {
      guildId: string;
      nickName: string;
    }) => {
      const response = await api.patch<ApiResponse<MemberResponse>>(
        `/guilds/${guildId}/members/@me/nick`,
        { nickName },
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: memberKeys.byGuild(variables.guildId),
      });
    },
  });
}

// Kick member
export function useKickMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      userId,
    }: {
      guildId: string;
      userId: string;
    }) => {
      await api.delete<ApiResponse<null>>(
        `/guilds/${guildId}/members/${userId}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: memberKeys.byGuild(variables.guildId),
      });
    },
  });
}

// Leave guild
export function useLeaveGuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ guildId }: { guildId: string }) => {
      await api.delete<ApiResponse<null>>(`/guilds/${guildId}/members/@me`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guilds'] });
    },
  });
}
