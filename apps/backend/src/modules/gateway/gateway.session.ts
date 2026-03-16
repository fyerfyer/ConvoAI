import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import Redis from 'ioredis';
import {
  CACHE_TTL,
  RedisKeys,
} from '../../common/constants/redis-keys.constant';

@Injectable()
export class GatewaySessionManager {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async setUserSocket(userId: string, socketId: string) {
    const key = RedisKeys.userSocket(userId);

    const pipeline = this.redisClient.pipeline();
    pipeline.sadd(key, socketId);

    // 设置过期时间，使用heartbeat机制刷新
    pipeline.expire(key, CACHE_TTL.USER_SOCKET);

    pipeline.sadd(RedisKeys.globalOnlineUser(), userId);

    await pipeline.exec();
  }

  async removeUserSocket(userId: string, socketId: string) {
    const key = RedisKeys.userSocket(userId);

    const pipeline = this.redisClient.pipeline();
    pipeline.srem(key, socketId);

    // 检查是否还有其他连接
    pipeline.scard(key);

    const results = await pipeline.exec();

    // 检查是否还有其他连接
    const remaining = results?.[1][1] as number;
    if (remaining === 0) {
      await this.redisClient.srem(RedisKeys.globalOnlineUser(), userId);
    }
  }

  async refreshUserSocketTTL(userId: string) {
    const key = RedisKeys.userSocket(userId);
    // 只有当 key 存在时才刷新，避免复活已离线的僵尸 session
    await this.redisClient.expire(key, CACHE_TTL.USER_SOCKET);
  }

  // 获取所有在线用户
  // 优化：维护一个 online_user 集合
  async getOnlineUsers() {
    return this.redisClient.smembers(RedisKeys.globalOnlineUser());
  }

  async joinChannelPresence(
    channelId: string,
    userId: string,
    socketId: string,
  ): Promise<void> {
    const pipeline = this.redisClient.pipeline();
    pipeline.hincrby(RedisKeys.channelPresence(channelId), userId, 1);
    pipeline.sadd(RedisKeys.socketChannels(socketId), channelId);
    pipeline.expire(
      RedisKeys.socketChannels(socketId),
      CACHE_TTL.CHANNEL_PRESENCE,
    );
    await pipeline.exec();
  }

  async leaveChannelPresence(
    channelId: string,
    userId: string,
    socketId: string,
  ): Promise<void> {
    await this.redisClient.srem(RedisKeys.socketChannels(socketId), channelId);
    // Lua 脚本原子执行：HINCRBY -1，若 ≤0 则 HDEL，避免竞态
    await this.redisClient.eval(
      `local c = redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
       if c <= 0 then redis.call('HDEL', KEYS[1], ARGV[1]) end
       return c`,
      1,
      RedisKeys.channelPresence(channelId),
      userId,
    );
  }

  async cleanupSocketPresence(userId: string, socketId: string): Promise<void> {
    const key = RedisKeys.socketChannels(socketId);
    const channels = await this.redisClient.smembers(key);
    if (channels.length > 0) {
      const pipeline = this.redisClient.pipeline();
      for (const channelId of channels) {
        // 同一个 Lua 脚本，原子递减
        pipeline.eval(
          `local c = redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
           if c <= 0 then redis.call('HDEL', KEYS[1], ARGV[1]) end
           return c`,
          1,
          RedisKeys.channelPresence(channelId),
          userId,
        );
      }
      await pipeline.exec();
    }
    await this.redisClient.del(key);
  }

  async getChannelPresenceUserIds(channelId: string): Promise<string[]> {
    return this.redisClient.hkeys(RedisKeys.channelPresence(channelId));
  }
}
