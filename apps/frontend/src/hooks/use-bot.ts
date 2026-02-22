import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import { toast } from './use-toast';
import {
  ApiResponse,
  BotResponse,
  BotListResponse,
  ChannelBotResponse,
  ChannelBotListResponse,
  CreateBotDTO,
  UpdateBotDTO,
  CreateChannelBotDTO,
  UpdateChannelBotDTO,
  TemplateInfo,
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
  templates: () => [...botKeys.all, 'templates'] as const,
};

export const channelBotKeys = {
  all: ['channel-bots'] as const,
  byChannel: (channelId: string) =>
    [...channelBotKeys.all, 'channel', channelId] as const,
  byBot: (botId: string) => [...channelBotKeys.all, 'bot', botId] as const,
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
        ApiResponse<BotResponse & { webhookSecret?: string }>
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

// List available bot templates
export function useTemplates() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: botKeys.templates(),
    queryFn: async () => {
      const response =
        await api.get<ApiResponse<{ templates: TemplateInfo[] }>>(
          '/bots/templates',
        );
      return response.data?.templates ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // templates rarely change
  });
}

// List bots bound to a channel
export function useChannelBots(channelId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: channelBotKeys.byChannel(channelId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<ChannelBotListResponse>>(
        `/bots/channel/${channelId}/bots`,
      );
      return response.data?.channelBots ?? [];
    },
    enabled: isAuthenticated && !!channelId,
    staleTime: 60 * 1000,
  });
}

// List channel bindings for a specific bot
export function useBotBindings(botId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: channelBotKeys.byBot(botId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<ChannelBotListResponse>>(
        `/bots/${botId}/channel-bindings`,
      );
      return response.data?.channelBots ?? [];
    },
    enabled: isAuthenticated && !!botId,
    staleTime: 60 * 1000,
  });
}

// Bind a bot to a channel
export function useBindBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateChannelBotDTO) => {
      const response = await api.post<ApiResponse<ChannelBotResponse>>(
        '/bots/channel-bindings',
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelBotKeys.byChannel(variables.channelId),
      });
      queryClient.invalidateQueries({
        queryKey: channelBotKeys.byBot(variables.botId),
      });
      queryClient.invalidateQueries({ queryKey: botKeys.all });
      toast({
        title: 'Bot Bound',
        description: 'Bot has been bound to the channel.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Bind Failed',
        description: getErrorMessage(error, 'Unable to bind bot to channel.'),
      });
    },
  });
}

// Update a channel bot binding
export function useUpdateChannelBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bindingId,
      data,
    }: {
      bindingId: string;
      channelId: string;
      botId: string;
      data: UpdateChannelBotDTO;
    }) => {
      const response = await api.put<ApiResponse<ChannelBotResponse>>(
        `/bots/channel-bindings/${bindingId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelBotKeys.byChannel(variables.channelId),
      });
      queryClient.invalidateQueries({
        queryKey: channelBotKeys.byBot(variables.botId),
      });
      toast({
        title: 'Binding Updated',
        description: 'Channel bot settings have been saved.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: getErrorMessage(error, 'Unable to update channel bot.'),
      });
    },
  });
}

// Unbind a bot from a channel
export function useUnbindBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bindingId,
    }: {
      bindingId: string;
      channelId: string;
      botId: string;
    }) => {
      await api.delete<ApiResponse<null>>(
        `/bots/channel-bindings/${bindingId}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelBotKeys.byChannel(variables.channelId),
      });
      queryClient.invalidateQueries({
        queryKey: channelBotKeys.byBot(variables.botId),
      });
      queryClient.invalidateQueries({ queryKey: botKeys.all });
      toast({
        title: 'Bot Unbound',
        description: 'Bot has been removed from the channel.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Unbind Failed',
        description: getErrorMessage(error, 'Unable to unbind bot.'),
      });
    },
  });
}
