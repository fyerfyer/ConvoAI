import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIOAdapter } from './common/adapters/redis-io.adapter';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global.filter';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // CORS
  const configService = app.get(ConfigService);
  const corsOrigin =
    configService.get<string>('app.corsOrigin') || 'http://localhost:4200';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Redis Adapter
  const redisIoAdapter = new RedisIOAdapter(app, configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = configService.get<number>('app.port') || 5000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap();
