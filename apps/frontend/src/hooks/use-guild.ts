import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  GuildResponse,
  GuildListResponse,
  CreateGuildDTO,
} from '@discord-platform/shared';

// Guild query keys
export const guildKeys = {
  all: ['guilds'] as const,
  lists: () => [...guildKeys.all, 'list'] as const,
  detail: (guildId: string) => [...guildKeys.all, 'detail', guildId] as const,
};

// Get guilds
export function useGuilds() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: guildKeys.lists(),
    queryFn: async () => {
      const response = await api.get<ApiResponse<GuildListResponse>>('/guilds');
      return response.data?.guilds ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Get guild by ID
export function useGuild(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: guildKeys.detail(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<GuildResponse>>(
        `/guilds/${guildId}`,
      );
      return response.data ?? null;
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 2 * 60 * 1000,
  });
}

// Create guild
export function useCreateGuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateGuildDTO) => {
      const response = await api.post<ApiResponse<GuildResponse>>(
        '/guilds',
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guildKeys.lists() });
    },
  });
}
