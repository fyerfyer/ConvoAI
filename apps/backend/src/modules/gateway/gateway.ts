import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GatewaySessionManager } from './gateway.session';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { JwtPayload } from '@discord-platform/shared';
import { SocketKeys } from '../../common/constants/socket-keys.constant';
import {
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GlobalExceptionFilter } from '../../common/filters/global.filter';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
@UseFilters(new GlobalExceptionFilter())
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly sessionManager: GatewaySessionManager,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  // 在 Connection 阶段，Guard 还没有被触发，需要手动注入
  async handleConnection(socket: Socket) {
    try {
      const canActivate = await this.wsJwtGuard.canActivate({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        switchToWs: () => ({ getClient: () => socket }) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      if (!canActivate) {
        socket.disconnect();
        return;
      }

      const user: JwtPayload = socket.data.user;
      await this.sessionManager.setUserSocket(user.sub, socket.id);
      await socket.join(SocketKeys.userRoom(user.sub));
    } catch {
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const user: JwtPayload = socket.data.user;
    if (user) {
      await this.sessionManager.removeUserSocket(user.sub, socket.id);
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    await client.join(roomId);
    return {
      event: 'joinedRoom',
      data: roomId,
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    await client.leave(roomId);
    return {
      event: 'leftRoom',
      data: roomId,
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const user: JwtPayload = client.data.user;
    await this.sessionManager.refreshUserSocketTTL(user.sub);
    return { status: 'ok' };
  }
}
