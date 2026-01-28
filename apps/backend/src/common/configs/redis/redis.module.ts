import { Global, Module } from '@nestjs/common';
import redisConfig from '../redis.config';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { ConfigModule } from '../config.module';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [redisConfig.KEY],
      useFactory: (redisCfg: ConfigType<typeof redisConfig>) => {
        return new Redis(redisCfg.redisUrl, {
          enableReadyCheck: true,
        });
      },
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [redisConfig.KEY],
      useFactory: (redisCfg: ConfigType<typeof redisConfig>) => {
        return new Redis(redisCfg.redisUrl, {
          enableReadyCheck: true,
        });
      },
    },
    ConfigModule,
  ],
})
export class RedisModule {}
