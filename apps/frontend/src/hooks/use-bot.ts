import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import { toast } from './use-toast';
import {
  ApiResponse,
  BotResponse,
  BotListResponse,
  CreateBotDTO,
  UpdateBotDTO,
} from '@discord-platform/shared';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0)
      return message;
  }
  return fallback;
}

export const botKeys = {
  all: ['bots'] as const,
  byGuild: (guildId: string) => [...botKeys.all, 'guild', guildId] as const,
  detail: (botId: string) => [...botKeys.all, 'detail', botId] as const,
};

// List bots in a guild
export function useBots(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: botKeys.byGuild(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<BotListResponse>>(
        `/bots/guild/${guildId}`,
      );
      return response.data?.bots ?? [];
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 60 * 1000,
  });
}

// Get single bot
export function useBot(botId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: botKeys.detail(botId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<BotResponse>>(
        `/bots/${botId}`,
      );
      return response.data ?? null;
    },
    enabled: isAuthenticated && !!botId,
    staleTime: 60 * 1000,
  });
}

// Create bot
export function useCreateBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBotDTO) => {
      const response = await api.post<
        ApiResponse<{ bot: BotResponse; webhookSecret: string }>
      >('/bots', data);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: botKeys.byGuild(variables.guildId),
      });
      toast({
        title: 'Bot Created',
        description: 'Your bot has been created successfully.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Create Bot Failed',
        description: getErrorMessage(error, 'Unable to create bot.'),
      });
    },
  });
}

// Update bot
export function useUpdateBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      botId,
      guildId,
      data,
    }: {
      botId: string;
      guildId: string;
      data: UpdateBotDTO;
    }) => {
      const response = await api.put<ApiResponse<BotResponse>>(
        `/bots/${botId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: botKeys.byGuild(variables.guildId),
      });
      queryClient.invalidateQueries({
        queryKey: botKeys.detail(variables.botId),
      });
      toast({
        title: 'Bot Updated',
        description: 'Bot settings have been saved.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Update Bot Failed',
        description: getErrorMessage(error, 'Unable to update bot.'),
      });
    },
  });
}

// Delete bot
export function useDeleteBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      botId,
      guildId,
    }: {
      botId: string;
      guildId: string;
    }) => {
      await api.delete<ApiResponse<null>>(`/bots/${botId}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: botKeys.byGuild(variables.guildId),
      });
      toast({
        title: 'Bot Deleted',
        description: 'The bot has been removed.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Delete Bot Failed',
        description: getErrorMessage(error, 'Unable to delete bot.'),
      });
    },
  });
}

// Regenerate webhook token
export function useRegenerateToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      botId,
      guildId,
    }: {
      botId: string;
      guildId: string;
    }) => {
      const response = await api.post<
        ApiResponse<{ webhookToken: string; webhookSecret: string }>
      >(`/bots/${botId}/regenerate-token`);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: botKeys.byGuild(variables.guildId),
      });
      queryClient.invalidateQueries({
        queryKey: botKeys.detail(variables.botId),
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Regenerate Failed',
        description: getErrorMessage(error, 'Unable to regenerate token.'),
      });
    },
  });
}
