import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, messageSchema } from './schemas/message.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: messageSchema },
      { name: Channel.name, schema: channelSchema },
    ]),
  ],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
