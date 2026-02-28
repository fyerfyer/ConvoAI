import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { HealthRegistry } from './health.registry';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
    private readonly healthRegistry: HealthRegistry,
  ) {}

  @Get()
  async check() {
    // Redis ping
    let redisStatus: 'up' | 'down' = 'down';
    try {
      const pong = await this.redisClient.ping();
      redisStatus = pong === 'PONG' ? 'up' : 'down';
    } catch {
      redisStatus = 'down';
    }

    const workers = this.healthRegistry.getAll();

    return {
      status: redisStatus === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      workers,
    };
  }
}
