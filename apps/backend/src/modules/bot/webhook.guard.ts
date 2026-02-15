import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { BotService } from './bot.service';

/**
 * Guard for webhook endpoints.
 * Validates the webhook token from the URL path parameter.
 * Attaches the resolved Bot document to `request.bot`.
 */
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

      // Verify the botId matches
      if (bot._id.toString() !== botId) {
        throw new UnauthorizedException('Invalid webhook credentials');
      }

      // Attach bot to request for use in controller
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
