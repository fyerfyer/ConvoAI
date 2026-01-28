import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RequestMethod } from '@nestjs/common';
import { AppLogger } from './logger.service';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const isProduction = configService.get('app.nodeEnv') === 'production';
        const logLevel = configService.get('logger.level') || 'info';

        return {
          pinoHttp: {
            level: logLevel,
            transport: !isProduction
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                    singleLine: false,
                  },
                }
              : undefined,
            customAttributeKeys: {
              req: 'request',
              res: 'response',
              err: 'error',
            },
            genReqId: (req) =>
              req.headers['x-request-id'] || crypto.randomUUID(),
            autoLogging: {
              ignore: (req) => req.url === '/health',
            },
            serializers: {
              req(req) {
                return {
                  id: req.id,
                  method: req.method,
                  url: req.url,
                  query: req.query,
                  params: req.params,
                  headers: {
                    host: req.headers.host,
                    'user-agent': req.headers['user-agent'],
                    'content-type': req.headers['content-type'],
                  },
                };
              },
              res(res) {
                return {
                  statusCode: res.statusCode,
                };
              },
            },
          },
          exclude: [{ method: RequestMethod.ALL, path: 'health' }],
          renameContext: 'context',
        };
      },
    }),
  ],
  providers: [AppLogger],
  exports: [PinoLoggerModule, AppLogger],
})
export class LoggerModule {}
