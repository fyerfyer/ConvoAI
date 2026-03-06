import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { AppLogger } from '../../common/configs/logger/logger.service';
import { UnreadInfo } from '@discord-platform/shared';
import {
  RedisKeys,
  CACHE_TTL,
} from '../../common/constants/redis-keys.constant';

/**
 * 使用 Redis 管理未读消息
 *
 * 存储策略：
 * - RedisKeys.unreadCount(userId, channelId)：未读消息数量
 * - RedisKeys.unreadLastMsgId(userId, channelId)：最新未读消息的 ID
 * - RedisKeys.unreadLastMsgAt(userId, channelId)：最新未读消息的时间戳
 *
 * 所有键在 30 天无活动后过期。
 */

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

      const countKey = RedisKeys.unreadCount(userId, channelId);
      const msgIdKey = RedisKeys.unreadLastMsgId(userId, channelId);
      const msgAtKey = RedisKeys.unreadLastMsgAt(userId, channelId);

      pipeline.incr(countKey);
      pipeline.expire(countKey, CACHE_TTL.UNREAD);
      pipeline.set(msgIdKey, messageId, 'EX', CACHE_TTL.UNREAD);
      pipeline.set(msgAtKey, messageAt, 'EX', CACHE_TTL.UNREAD);
    }

    await pipeline.exec();
  }

  async markRead(userId: string, channelId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(RedisKeys.unreadCount(userId, channelId));
    pipeline.del(RedisKeys.unreadLastMsgId(userId, channelId));
    pipeline.del(RedisKeys.unreadLastMsgAt(userId, channelId));
    await pipeline.exec();
  }

  async getUnreadForChannel(
    userId: string,
    channelId: string,
  ): Promise<UnreadInfo> {
    const [count, lastMsgId, lastMsgAt] = await Promise.all([
      this.redis.get(RedisKeys.unreadCount(userId, channelId)),
      this.redis.get(RedisKeys.unreadLastMsgId(userId, channelId)),
      this.redis.get(RedisKeys.unreadLastMsgAt(userId, channelId)),
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
      pipeline.get(RedisKeys.unreadCount(userId, channelId));
      pipeline.get(RedisKeys.unreadLastMsgId(userId, channelId));
      pipeline.get(RedisKeys.unreadLastMsgAt(userId, channelId));
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
}
