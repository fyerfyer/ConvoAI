import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, messageSchema } from './schemas/message.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { ChannelModule } from '../channel/channel.module';
import { ChatController } from './chat.controller';
import { MemberModule } from '../member/member.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: messageSchema },
      { name: Channel.name, schema: channelSchema },
    ]),
    MemberModule,
    ChannelModule,
  ],
  providers: [ChatService],
  exports: [ChatService],
  controllers: [ChatController],
})
export class ChatModule {}
