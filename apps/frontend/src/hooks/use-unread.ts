import { useQuery, useMutation, useQueries } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import { useUnreadStore } from '../stores/unread-store';
import {
  ApiResponse,
  UnreadCountResponse,
  GuildResponse,
} from '@discord-platform/shared';

export const unreadKeys = {
  all: ['unread'] as const,
  byGuild: (guildId: string) => [...unreadKeys.all, 'guild', guildId] as const,
};

/**
 * Fetch unread counts for all channels in a guild.
 * Automatically syncs results into the Zustand unread store.
 */
export function useGuildUnread(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setBulkUnread = useUnreadStore((state) => state.setBulkUnread);

  return useQuery({
    queryKey: unreadKeys.byGuild(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<UnreadCountResponse>>(
        `/guilds/${guildId}/unread`,
      );
      const channels = response.data?.channels ?? [];
      // Sync to zustand store
      setBulkUnread(channels);
      return channels;
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute as fallback
  });
}

/**
 * Fetch unread counts for ALL guilds the user belongs to.
 * Populates the unread store so guild sidebar can show badges.
 */
export function useAllGuildsUnread(guilds: GuildResponse[] | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setBulkUnread = useUnreadStore((state) => state.setBulkUnread);

  return useQueries({
    queries: (guilds ?? []).map((guild) => ({
      queryKey: unreadKeys.byGuild(guild.id),
      queryFn: async () => {
        const response = await api.get<ApiResponse<UnreadCountResponse>>(
          `/guilds/${guild.id}/unread`,
        );
        const channels = response.data?.channels ?? [];
        setBulkUnread(channels);
        return channels;
      },
      enabled: isAuthenticated,
      staleTime: 30 * 1000,
      refetchInterval: 60 * 1000,
    })),
  });
}

/**
 * Mark a channel as read via REST API.
 */
export function useMarkRead() {
  const clearUnread = useUnreadStore((state) => state.clearUnread);

  return useMutation({
    mutationFn: async (channelId: string) => {
      await api.post<ApiResponse<null>>(`/channels/${channelId}/read`);
      return channelId;
    },
    onSuccess: (channelId) => {
      clearUnread(channelId);
    },
  });
}

/**
 * Get unread count for a specific channel from the store.
 */
export function useChannelUnreadCount(channelId: string): number {
  return useUnreadStore(
    (state) => state.unreadByChannel[channelId]?.count ?? 0,
  );
}

/**
 * Check if a guild has any unread messages across its channels.
 */
export function useGuildHasUnread(channelIds: string[]): boolean {
  return useUnreadStore((state) =>
    channelIds.some((id) => (state.unreadByChannel[id]?.count ?? 0) > 0),
  );
}
