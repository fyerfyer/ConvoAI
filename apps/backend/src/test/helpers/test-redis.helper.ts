import Redis from 'ioredis';

export class TestRedisHelper {
  private static client: Redis | null = null;
  static async connect(): Promise<Redis> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';
    this.client = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    // Wait for connection to be ready
    await new Promise<void>((resolve, reject) => {
      this.client?.on('ready', resolve);
      this.client?.on('error', reject);
    });

    return this.client;
  }

  static getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    return this.client;
  }

  static async clearRedis(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    await this.client.flushdb();
  }

  static async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
