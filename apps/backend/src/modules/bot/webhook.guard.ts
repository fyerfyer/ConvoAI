import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { BotService } from './bot.service';

// 校验 Webhook 请求是否合法
@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(private readonly botService: BotService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { botId, token } = request.params;

    if (!botId || !token) {
      throw new UnauthorizedException('Missing webhook credentials');
    }

    try {
      const bot = await this.botService.findByWebhookToken(token);

      // 确保请求的 botId 与 token 对应的 bot 匹配
      if (bot._id.toString() !== botId) {
        throw new UnauthorizedException('Invalid webhook credentials');
      }

      request.bot = bot;
      return true;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new UnauthorizedException('Invalid webhook token');
      }
      throw err;
    }
  }
}
