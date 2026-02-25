import { Global, Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { REDIS_CLIENT } from '../redis/redis.module';
import Redis from 'ioredis';

// 全局限流器
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redisClient: Redis) => ({
        storage: new RedisThrottlerStorage(redisClient),
        throttlers: [
          {
            name: 'short',
            ttl: 1000,
            limit: 10,
          },
          {
            name: 'medium',
            ttl: 10000,
            limit: 60,
          },
          {
            name: 'long',
            ttl: 60000,
            limit: 300,
          },
        ],
      }),
    }),
  ],
  providers: [
    // 全局应用 ThrottlerGuard 到所有 HTTP 端点
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ThrottleModule {}
