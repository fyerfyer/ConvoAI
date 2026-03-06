import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  AutoModConfigResponse,
  AutoModLogListResponse,
  UpdateAutoModConfigDTO,
} from '@discord-platform/shared';
import { guildKeys } from './use-guild';

export const automodKeys = {
  all: ['automod'] as const,
  config: (guildId: string) => [...automodKeys.all, 'config', guildId] as const,
  logs: (guildId: string) => [...automodKeys.all, 'logs', guildId] as const,
};

export function useAutoModConfig(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: automodKeys.config(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<AutoModConfigResponse>>(
        `/guilds/${guildId}/automod/config`,
      );
      return response.data ?? { enabled: false, rules: [] };
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 30 * 1000,
  });
}

export function useUpdateAutoModConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      data,
    }: {
      guildId: string;
      data: UpdateAutoModConfigDTO;
    }) => {
      const response = await api.put<ApiResponse<AutoModConfigResponse>>(
        `/guilds/${guildId}/automod/config`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: automodKeys.config(variables.guildId),
      });
      queryClient.invalidateQueries({
        queryKey: guildKeys.detail(variables.guildId),
      });
    },
  });
}

export function useAutoModLogs(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: automodKeys.logs(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<AutoModLogListResponse>>(
        `/guilds/${guildId}/automod/logs`,
      );
      return response.data ?? { logs: [], total: 0 };
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 15 * 1000,
  });
}
