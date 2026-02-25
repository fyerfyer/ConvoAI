import { Module } from '@nestjs/common';
import { ChatGateway } from './gateway';
import { GatewaySessionManager } from './gateway.session';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { ChatModule } from '../chat/chat.module';
import { ChannelModule } from '../channel/channel.module';
import { BotModule } from '../bot/bot.module';
import { MessageProcessor } from './message.processor';
import { BotStreamProcessor } from './bot-stream.processor';

@Module({
  imports: [ChatModule, ChannelModule, BotModule],
  providers: [
    ChatGateway,
    GatewaySessionManager,
    WsJwtGuard,
    MessageProcessor,
    BotStreamProcessor,
  ],
  exports: [ChatGateway],
})
export class GatewayModule {}
