import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { REDIS_CLIENT } from '../redis/redis.module';
import Redis from 'ioredis';

// 基于 Redis 的 ThrottlerStorage
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly prefix = 'throttle:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleDestroy() {
    // Redis client is managed by RedisModule, no cleanup needed here
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // TODO：可以优化为 Lua 脚本或者 pipeline
    const storageKey = `${this.prefix}${throttlerName}:${key}`;
    const blockKey = `${storageKey}:blocked`;
    const ttlSeconds = Math.ceil(ttl / 1000);

    const isBlocked = await this.redis.exists(blockKey);
    if (isBlocked) {
      const timeToBlockExpire = await this.redis.ttl(blockKey);
      const totalHits = parseInt((await this.redis.get(storageKey)) || '0', 10);
      return {
        totalHits,
        timeToExpire: ttlSeconds,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    const totalHits = await this.redis.incr(storageKey);

    if (totalHits === 1) {
      await this.redis.expire(storageKey, ttlSeconds);
    }

    const timeToExpire = await this.redis.ttl(storageKey);

    if (totalHits > limit && blockDuration > 0) {
      const blockSeconds = Math.ceil(blockDuration / 1000);
      await this.redis.setex(blockKey, blockSeconds, '1');
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: blockSeconds,
      };
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
