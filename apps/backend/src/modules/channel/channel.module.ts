import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Channel, channelSchema } from './schemas/channel.schema';
import { MemberModule } from '../member/member.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Channel.name, schema: channelSchema }]),
    MemberModule,
  ],
  providers: [ChannelService],
  controllers: [ChannelController],
  exports: [ChannelService],
})
export class ChannelModule {}
