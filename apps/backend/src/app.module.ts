import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ConfigModule } from './common/configs/config.module';
import { LoggerModule } from './common/configs/logger/logger.module';
import { ChatModule } from './modules/chat/chat.module';
import { MediaModule } from './modules/media/media.module';
import { MemberModule } from './modules/member/member.module';
import { GuildModule } from './modules/guild/guild.module';
import { S3Module } from './common/configs/s3/s3.module';
import { ChannelModule } from './modules/channel/channel.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
    UserModule,
    GuildModule,
    MemberModule,
    MediaModule,
    ChatModule,
    S3Module,
    ChannelModule,
  ],
})
export class AppModule {}
