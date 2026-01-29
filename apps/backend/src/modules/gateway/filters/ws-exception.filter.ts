import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch(WsException, HttpException)
export class GlobalWsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: any, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    let error;

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      error = response; // 通常包含 statusCode 和 message
    } else if (exception instanceof WsException) {
      error = { message: exception.message };
    } else {
      error = { message: 'Internal Server Error' };
    }

    // 主动向客户端发送 'error' 事件
    client.emit('exception', {
      timestamp: new Date().toISOString(),
      ...(typeof error === 'object' ? error : { message: error }),
    });
  }
}
