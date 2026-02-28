import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import { useUnreadStore } from '../stores/unread-store';
import { ApiResponse, UnreadCountResponse } from '@discord-platform/shared';

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
