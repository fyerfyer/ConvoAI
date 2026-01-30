export class RedisKeys {
  // 控制整个Guild的权限缓存版本，修改后自动废弃所有旧版本缓存
  static guildPermVersion(guildId: string): string {
    return `guild_perm_version:${guildId}`;
  }

  // 用户在Guild下的权限缓存
  static userPermission(
    guildId: string,
    version: string,
    userId: string,
    channelId?: string,
  ): string {
    return `permissions:${guildId}:${version}:${userId}:${channelId || 'global'}`;
  }

  // 用户权限缓存匹配模式
  static userPermissionPattern(
    guildId: string,
    version: string,
    userId: string,
  ): string {
    return `permissions:${guildId}:${version}:${userId}:*`;
  }

  static userSocket(userId: string): string {
    return `user_socket:${userId}`;
  }

  static globalOnlineUser(): string {
    return 'global_online_users';
  }
}

export const CACHE_TTL = {
  // 权限缓存
  PERMISSIONS: 300,
  // ws 缓存
  USER_SOCKET: 86400,
} as const;
