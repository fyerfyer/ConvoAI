export class RedisKeys {
  // ── 权限相关 ──────────────────────────────────────

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

  // socket 在线状态
  static userSocket(userId: string): string {
    return `user_socket:${userId}`;
  }

  static globalOnlineUser(): string {
    return 'global_online_users';
  }

  // 频道在线状态：Hash field=userId, value=socket引用计数
  static channelPresence(channelId: string): string {
    return `channel_presence:${channelId}`;
  }

  // 单个 socket 加入的所有频道，用于 disconnect 时清理
  static socketChannels(socketId: string): string {
    return `socket_channels:${socketId}`;
  }

  // AutoMod
  // 记录用户在某频道的近期消息，用于检测重复刷屏
  static automodSpam(
    guildId: string,
    channelId: string,
    userId: string,
  ): string {
    return `automod:spam:${guildId}:${channelId}:${userId}`;
  }

  // 未读消息数量
  static unreadCount(userId: string, channelId: string): string {
    return `unread:${userId}:${channelId}:count`;
  }

  // 最新未读消息 ID
  static unreadLastMsgId(userId: string, channelId: string): string {
    return `unread:${userId}:${channelId}:lastMsgId`;
  }

  // 最新未读消息时间戳
  static unreadLastMsgAt(userId: string, channelId: string): string {
    return `unread:${userId}:${channelId}:lastMsgAt`;
  }
}

export const CACHE_TTL = {
  // 权限缓存
  PERMISSIONS: 300,
  // ws 缓存
  USER_SOCKET: 86400,
  // AutoMod 消息窗口
  AUTOMOD_SPAM: 30,
  // 未读消息过期时间 (30天)
  UNREAD: 30 * 24 * 60 * 60,
  // 频道在线状态过期时间 (与 socket 一致)
  CHANNEL_PRESENCE: 86400,
} as const;
