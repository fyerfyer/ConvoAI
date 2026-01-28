import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';
import { JwtModule } from '@nestjs/jwt';
import appConfig from '../../common/configs/app.config';
import { ConfigType } from '@nestjs/config';
import { type StringValue } from 'ms';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      inject: [appConfig.KEY],
      useFactory: (appConf: ConfigType<typeof appConfig>) => ({
        secret: appConf.jwtSecret,
        signOptions: { expiresIn: appConf.jwtExpire as StringValue },
      }),
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
