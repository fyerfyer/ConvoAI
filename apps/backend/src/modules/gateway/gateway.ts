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
import {
  CreateMessageDTO,
  createMessageDTOSchema,
  JwtPayload,
  SOCKET_EVENT,
} from '@discord-platform/shared';
import { SocketKeys } from '../../common/constants/socket-keys.constant';
import {
  ForbiddenException,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { GlobalWsExceptionFilter } from './filters/ws-exception.filter';
import { ChatService } from '../chat/chat.service';
import { ChannelService } from '../channel/channel.service';
import { WsThrottlerGuard } from '../../common/guards/ws-throttler.guard';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
@UseFilters(new GlobalWsExceptionFilter())
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@SkipThrottle() // Ws gateway 单独限流
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly sessionManager: GatewaySessionManager,
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly chatService: ChatService,
    private readonly channelService: ChannelService,
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
  @SubscribeMessage(SOCKET_EVENT.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    const canAccess = await this.channelService.checkAccess(
      client.data.user.sub,
      roomId,
    );
    if (!canAccess) {
      throw new ForbiddenException(
        'You do not have permission to join this room',
      );
    }
    await client.join(roomId);
    return {
      event: SOCKET_EVENT.JOIN_ROOM,
      data: roomId,
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(SOCKET_EVENT.LEAVE_ROOM)
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    await client.leave(roomId);
    return {
      event: SOCKET_EVENT.LEAVE_ROOM,
      data: roomId,
    };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(SOCKET_EVENT.HEARTBEAT)
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const user: JwtPayload = client.data.user;
    await this.sessionManager.refreshUserSocketTTL(user.sub);
    return { status: 'ok' };
  }

  // 这里只负责消息的创建，不负责消息的广播
  @UseGuards(WsJwtGuard, WsThrottlerGuard)
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 30, ttl: 10000 },
  })
  @SubscribeMessage(SOCKET_EVENT.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ZodValidationPipe(createMessageDTOSchema))
    payload: CreateMessageDTO,
  ) {
    const user: JwtPayload = client.data.user;
    await this.chatService.createMessage(user.sub, payload);
    return { status: 'sent', data: { tempId: payload.nonce } };
  }

  @UseGuards(WsJwtGuard, WsThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 10000 },
  })
  @SubscribeMessage(SOCKET_EVENT.TYPING)
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string; isTyping: boolean },
  ) {
    const { channelId, isTyping } = payload;
    const user: JwtPayload = client.data.user;
    client.to(channelId).emit(SOCKET_EVENT.TYPING, {
      userId: user.sub,
      channelId,
      isTyping,
    });
  }

  // Voice Events
  @UseGuards(WsJwtGuard)
  @SubscribeMessage(SOCKET_EVENT.VOICE_JOIN)
  async handleVoiceJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ) {
    const user: JwtPayload = client.data.user;
    const voiceRoom = `voice:${payload.channelId}`;
    await client.join(voiceRoom);

    this.server.to(voiceRoom).emit(SOCKET_EVENT.VOICE_STATE_UPDATE, {
      channelId: payload.channelId,
      userId: user.sub,
      name: user.name,
      action: 'joined',
    });

    return { status: 'joined', channelId: payload.channelId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(SOCKET_EVENT.VOICE_LEAVE)
  async handleVoiceLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ) {
    const user: JwtPayload = client.data.user;
    const voiceRoom = `voice:${payload.channelId}`;

    this.server.to(voiceRoom).emit(SOCKET_EVENT.VOICE_STATE_UPDATE, {
      channelId: payload.channelId,
      userId: user.sub,
      name: user.name,
      action: 'left',
    });

    await client.leave(voiceRoom);
    return { status: 'left', channelId: payload.channelId };
  }
}
