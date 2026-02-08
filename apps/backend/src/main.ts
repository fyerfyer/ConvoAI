/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIOAdapter } from './common/adapters/redis-io.adapter';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Redis Adapter
  const configService = app.get(ConfigService);
  const redisIoAdapter = new RedisIOAdapter(app, configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
