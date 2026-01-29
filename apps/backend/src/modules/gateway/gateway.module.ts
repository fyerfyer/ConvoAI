import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import appConfig from '../../common/configs/app.config';
import { ConfigType } from '@nestjs/config';
import { StringValue } from 'ms';
import { ChatGateway } from './gateway';
import { GatewaySessionManager } from './gateway.session';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [appConfig.KEY],
      useFactory: (appConf: ConfigType<typeof appConfig>) => ({
        secret: appConf.jwtSecret,
        signOptions: { expiresIn: appConf.jwtExpire as StringValue },
      }),
    }),
  ],

  providers: [ChatGateway, GatewaySessionManager, WsJwtGuard],
  exports: [ChatGateway],
})
export class GatewayModule {}
