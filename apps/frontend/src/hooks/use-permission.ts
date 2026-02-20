import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  PermissionResponse,
  PermissionUtil,
  PERMISSIONS,
} from '@discord-platform/shared';
import { useMemo } from 'react';

export const permissionKeys = {
  all: ['permissions'] as const,
  byGuild: (guildId: string) =>
    [...permissionKeys.all, 'guild', guildId] as const,
};

// Fetch the current user's computed permissions for a guild
export function useMyPermissions(guildId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: permissionKeys.byGuild(guildId ?? ''),
    queryFn: async () => {
      const response = await api.get<ApiResponse<PermissionResponse>>(
        `/guilds/${guildId}/members/@me/permissions`,
      );
      return response.data?.permissions ?? 0;
    },
    enabled: isAuthenticated && !!guildId,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Hook that returns boolean permission checkers for the current user in a guild.
export function usePermissions(guildId: string | undefined) {
  const { data: permissions = 0, isLoading } = useMyPermissions(guildId);

  const checks = useMemo(() => {
    const has = (perm: number) => PermissionUtil.has(permissions, perm);
    return {
      permissions,
      isLoading,
      isAdmin: has(PERMISSIONS.ADMINISTRATOR),
      canManageGuild: has(PERMISSIONS.MANAGE_GUILD),
      canManageRoles: has(PERMISSIONS.MANAGE_ROLES),
      canKickMembers: has(PERMISSIONS.KICK_MEMBERS),
      canBanMembers: has(PERMISSIONS.BAN_MEMBERS),
      canMuteMembers: has(PERMISSIONS.MUTE_MEMBERS),
      canSendMessages: has(PERMISSIONS.SEND_MESSAGES),
      canMentionEveryone: has(PERMISSIONS.MENTION_EVERYONE),
      canViewChannels: has(PERMISSIONS.VIEW_CHANNELS),
      canAttachFiles: has(PERMISSIONS.ATTACH_FILES),
      canEmbedLinks: has(PERMISSIONS.EMBED_LINKS),
      canConnect: has(PERMISSIONS.CONNECT),
      canSpeak: has(PERMISSIONS.SPEAK),
      hasPerm: has,
    };
  }, [permissions, isLoading]);

  return checks;
}
