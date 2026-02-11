import { Module } from '@nestjs/common';
import { ChatGateway } from './gateway';
import { GatewaySessionManager } from './gateway.session';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { ChatModule } from '../chat/chat.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [ChatModule, ChannelModule],
  providers: [ChatGateway, GatewaySessionManager, WsJwtGuard],
  exports: [ChatGateway],
})
export class GatewayModule {}
