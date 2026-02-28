import { Module } from '@nestjs/common';
import { UnreadService } from './unread.service';
import { UnreadController } from './unread.controller';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [ChannelModule],
  providers: [UnreadService],
  controllers: [UnreadController],
  exports: [UnreadService],
})
export class UnreadModule {}
