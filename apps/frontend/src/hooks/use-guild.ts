import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  GuildResponse,
  GuildListResponse,
  GuildSearchResponse,
  InviteResponse,
  InviteListResponse,
  CreateGuildDTO,
  CreateInviteDTO,
} from '@discord-platform/shared';

export const guildKeys = {
  all: ['guilds'] as const,
  lists: () => [...guildKeys.all, 'list'] as const,
  detail: (guildId: string) => [...guildKeys.all, 'detail', guildId] as const,
  search: (query: string) => [...guildKeys.all, 'search', query] as const,
  invites: (guildId: string) =>
    [...guildKeys.all, 'invites', guildId] as const,
  inviteInfo: (code: string) =>
    [...guildKeys.all, 'invite', code] as const,
};

export function useGuilds() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: guildKeys.lists(),
    queryFn: async () => {
      const response = await api.get<ApiResponse<GuildListResponse>>('/guilds');
      return response.data?.guilds ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });
}

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

export function useSearchGuilds(query: string) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: guildKeys.search(query),
    queryFn: async () => {
      const response = await api.get<ApiResponse<GuildSearchResponse>>(
        `/guilds/search?q=${encodeURIComponent(query)}&limit=20`,
      );
      return response.data ?? { guilds: [], total: 0 };
    },
    enabled: isAuthenticated && query.trim().length > 0,
    staleTime: 30 * 1000,
  });
}

export function useJoinGuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (guildId: string) => {
      const response = await api.post<ApiResponse<GuildResponse>>(
        `/guilds/${guildId}/join`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guildKeys.lists() });
    },
  });
}

export function useJoinViaInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const response = await api.post<ApiResponse<GuildResponse>>(
        `/guilds/invites/${code}/join`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guildKeys.lists() });
    },
  });
}

export function useInviteInfo(code: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: guildKeys.inviteInfo(code ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<InviteResponse>>(
        `/guilds/invites/${code}`,
      );
      return response.data ?? null;
    },
    enabled: isAuthenticated && !!code,
  });
}

export function useGuildInvites(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: guildKeys.invites(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<InviteListResponse>>(
        `/guilds/${guildId}/invites`,
      );
      return response.data?.invites ?? [];
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 30 * 1000,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      data,
    }: {
      guildId: string;
      data?: CreateInviteDTO;
    }) => {
      const response = await api.post<ApiResponse<InviteResponse>>(
        `/guilds/${guildId}/invites`,
        data ?? {},
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: guildKeys.invites(variables.guildId),
      });
    },
  });
}

export function useDeleteInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      code,
    }: {
      guildId: string;
      code: string;
    }) => {
      await api.delete(`/guilds/${guildId}/invites/${code}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: guildKeys.invites(variables.guildId),
      });
    },
  });
}
