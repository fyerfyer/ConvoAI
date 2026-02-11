import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import appConfig from '../app.config';
import { ConfigType } from '@nestjs/config';
import { type StringValue } from 'ms';

@Global()
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
  exports: [JwtModule],
})
export class JwtConfigModule {}
