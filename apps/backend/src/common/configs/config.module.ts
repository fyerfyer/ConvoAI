import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import appConfig from './app.config';
import mongoConfig from './mongo.config';
import redisConfig from './redis.config';
import s3Config from './s3.config';
import loggerConfig from './logger.config';
import Joi from 'joi';
import { join } from 'path';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, mongoConfig, redisConfig, s3Config, loggerConfig],
      envFilePath: [
        // 使用 process.cwd() 获取工作目录
        join(process.cwd(), 'apps/backend/.env'),
        join(process.cwd(), 'apps/backend/.env.test'),
        join(process.cwd(), '.env'),
        join(process.cwd(), '.env.test'),
        // 兼容旧路径
        '.env',
        '.env.test',
      ],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production')
          .default('development'),
        PORT: Joi.number().port().default(5000),
        LOG_LEVEL: Joi.string()
          .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
          .default('info'),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRE: Joi.string().default('7d'),
        CORS_ORIGIN: Joi.string().default('http://localhost:4200'),
        FRONTEND_URL: Joi.string().default('http://localhost:4200'),

        MONGODB_URI: Joi.string().required(),
        MONGODB_NAME: Joi.string().required(),

        REDIS_URL: Joi.string().default('redis://localhost:6379'),

        MINIO_ENDPOINT: Joi.string().default('http://localhost:9000'),
        MINIO_ACCESS_KEY: Joi.string().default('minioadmin'),
        MINIO_SECRET_KEY: Joi.string().default('minioadmin123'),
        MINIO_PUBLIC_URL: Joi.string().default('http://localhost:9000'),
      }),
    }),
  ],
})
export class ConfigModule {}
