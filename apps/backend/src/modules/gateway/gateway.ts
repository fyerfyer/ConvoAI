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
  MESSAGE_EVENT,
  BOT_INTERNAL_EVENT,
  SOCKET_EVENT,
  BotStreamStartPayload,
  BotStreamChunkPayload,
} from '@discord-platform/shared';
import { SocketKeys } from '../../common/constants/socket-keys.constant';
import {
  ForbiddenException,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { GlobalWsExceptionFilter } from './filters/ws-exception.filter';
import { ChatService } from '../chat/chat.service';
import { OnEvent } from '@nestjs/event-emitter';
import { MessageDocument } from '../chat/schemas/message.schema';
import { ChannelService } from '../channel/channel.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
@UseFilters(new GlobalWsExceptionFilter())
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
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
  @UseGuards(WsJwtGuard)
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

  @UseGuards(WsJwtGuard)
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

  // 监听全局消息事件
  @OnEvent(MESSAGE_EVENT.CREATE_MESSAGE)
  async handleMessageCreated(message: MessageDocument) {
    const roomId = message.channelId.toString();
    const response = await this.chatService.toMessageResponse(message);

    // 向房间内所有用户广播消息
    this.server.to(roomId).emit(SOCKET_EVENT.NEW_MESSAGE, response);
  }

  // Bot 流事件
  @OnEvent(BOT_INTERNAL_EVENT.BOT_STREAM_START)
  handleBotStreamStart(payload: BotStreamStartPayload) {
    this.server
      .to(payload.channelId)
      .emit(SOCKET_EVENT.BOT_STREAM_START, payload);
  }

  @OnEvent(BOT_INTERNAL_EVENT.BOT_STREAM_CHUNK)
  handleBotStreamChunk(payload: BotStreamChunkPayload) {
    this.server
      .to(payload.channelId)
      .emit(SOCKET_EVENT.BOT_STREAM_CHUNK, payload);
  }

  @OnEvent(BOT_INTERNAL_EVENT.BOT_STREAM_END)
  handleBotStreamEnd(payload: BotStreamChunkPayload) {
    this.server
      .to(payload.channelId)
      .emit(SOCKET_EVENT.BOT_STREAM_END, payload);
  }
}
