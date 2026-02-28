import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { AppLogger } from '../../common/configs/logger/logger.service';
import { UnreadInfo } from '@discord-platform/shared';

/**
 * 使用 Redis 管理未读消息
 *
 * 存储策略：
 * - `unread:{userId}:{channelId}:count`：未读消息数量
 * - `unread:{userId}:{channelId}:lastMsgId`：最新未读消息的 ID
 * - `unread:{userId}:{channelId}:lastMsgAt`：最新未读消息的时间戳
 *
 * 所有键在 30 天无活动后过期。
 */
const UNREAD_TTL = 30 * 24 * 60 * 60; // 30 days

@Injectable()
export class UnreadService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: AppLogger,
  ) {}

  async incrementUnread(
    channelId: string,
    messageId: string,
    messageAt: string,
    memberUserIds: string[],
    senderUserId: string,
  ): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const userId of memberUserIds) {
      if (userId === senderUserId) continue;

      const countKey = this.countKey(userId, channelId);
      const msgIdKey = this.lastMsgIdKey(userId, channelId);
      const msgAtKey = this.lastMsgAtKey(userId, channelId);

      pipeline.incr(countKey);
      pipeline.expire(countKey, UNREAD_TTL);
      pipeline.set(msgIdKey, messageId, 'EX', UNREAD_TTL);
      pipeline.set(msgAtKey, messageAt, 'EX', UNREAD_TTL);
    }

    await pipeline.exec();
  }

  async markRead(userId: string, channelId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(this.countKey(userId, channelId));
    pipeline.del(this.lastMsgIdKey(userId, channelId));
    pipeline.del(this.lastMsgAtKey(userId, channelId));
    await pipeline.exec();
  }

  async getUnreadForChannel(
    userId: string,
    channelId: string,
  ): Promise<UnreadInfo> {
    const [count, lastMsgId, lastMsgAt] = await Promise.all([
      this.redis.get(this.countKey(userId, channelId)),
      this.redis.get(this.lastMsgIdKey(userId, channelId)),
      this.redis.get(this.lastMsgAtKey(userId, channelId)),
    ]);

    return {
      channelId,
      count: parseInt(count || '0', 10),
      lastMessageId: lastMsgId || undefined,
      lastMessageAt: lastMsgAt || undefined,
    };
  }

  async getUnreadForChannels(
    userId: string,
    channelIds: string[],
  ): Promise<UnreadInfo[]> {
    if (channelIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const channelId of channelIds) {
      pipeline.get(this.countKey(userId, channelId));
      pipeline.get(this.lastMsgIdKey(userId, channelId));
      pipeline.get(this.lastMsgAtKey(userId, channelId));
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const unreadInfos: UnreadInfo[] = [];
    for (let i = 0; i < channelIds.length; i++) {
      const countResult = results[i * 3];
      const msgIdResult = results[i * 3 + 1];
      const msgAtResult = results[i * 3 + 2];

      const count = parseInt((countResult?.[1] as string) || '0', 10);
      if (count > 0) {
        unreadInfos.push({
          channelId: channelIds[i],
          count,
          lastMessageId: (msgIdResult?.[1] as string) || undefined,
          lastMessageAt: (msgAtResult?.[1] as string) || undefined,
        });
      }
    }

    return unreadInfos;
  }

  private countKey(userId: string, channelId: string): string {
    return `unread:${userId}:${channelId}:count`;
  }

  private lastMsgIdKey(userId: string, channelId: string): string {
    return `unread:${userId}:${channelId}:lastMsgId`;
  }

  private lastMsgAtKey(userId: string, channelId: string): string {
    return `unread:${userId}:${channelId}:lastMsgAt`;
  }
}
