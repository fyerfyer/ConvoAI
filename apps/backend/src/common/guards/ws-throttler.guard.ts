import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { Socket } from 'socket.io';
import { Request, Response } from 'express';

// Websocket 专用限流器
// 从 Request 中提取用户 ID 或 IP 作为限流 tracker
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, generateKey } =
      requestProps;

    const client: Socket = context.switchToWs().getClient();

    const userId = client.data?.user?.sub;
    const ip =
      client.handshake?.headers?.['x-forwarded-for']?.toString() ||
      client.handshake?.address ||
      'unknown';
    const tracker = userId || ip;

    const throttlerName = throttler.name ?? 'default';
    const key = generateKey(context, tracker, throttlerName);

    const result = await this.storageService.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );

    if (result.isBlocked) {
      // 不 Throw 429 断开连接，而是推送错误消息
      client.emit('exception', {
        status: 'error',
        message: `Rate limit exceeded. Try again in ${result.timeToBlockExpire}s`,
        code: 429,
      });
      return false;
    }

    return true;
  }

  protected getRequestResponse(context: ExecutionContext) {
    if (context.getType() === 'ws') {
      const client = context.switchToWs().getClient<Socket>();
      return {
        req: {
          ip:
            client.handshake?.headers?.['x-forwarded-for']?.toString() ||
            client.handshake?.address,
          method: 'WS',
          url: context.switchToWs().getPattern?.() || 'ws',
        } as Request,
        res: {} as Response,
      };
    }
    return super.getRequestResponse(context);
  }
}
