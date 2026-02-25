import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      // 直接使用已有 Redis 连接
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get<string>('redis.redisUrl') ||
          configService.get<string>('REDIS_URL') ||
          configService.get<string>('REDIS_URI') ||
          'redis://localhost:6379';

        const url = new URL(redisUrl);

        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
            password: url.password || undefined,
            db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
          },
          defaultJobOptions: {
            attempts: DEFAULT_JOB_OPTIONS.attempts,
            backoff: {
              type: 'exponential',
              delay: DEFAULT_JOB_OPTIONS.backoffDelay,
            },
            removeOnComplete: {
              age: DEFAULT_JOB_OPTIONS.removeOnCompleteAge,
            },
            removeOnFail: {
              age: DEFAULT_JOB_OPTIONS.removeOnFailAge,
            },
          },
        };
      },
    }),

    BullModule.registerQueue(
      { name: QUEUE_NAMES.MESSAGE },
      { name: QUEUE_NAMES.BOT_EXECUTION },
      { name: QUEUE_NAMES.BOT_STREAM },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
