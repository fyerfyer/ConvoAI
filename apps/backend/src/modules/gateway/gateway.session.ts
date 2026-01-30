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
    await this.redisClient.sadd(key, socketId);

    // 设置过期时间，使用heartbeat机制刷新
    await this.redisClient.expire(key, CACHE_TTL.USER_SOCKET);

    await this.redisClient.sadd(RedisKeys.globalOnlineUser(), userId);
  }

  async removeUserSocket(userId: string, socketId: string) {
    const key = RedisKeys.userSocket(userId);
    await this.redisClient.srem(key, socketId);

    // 检查是否还有其他连接
    const remaining = await this.redisClient.scard(key);
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
}
