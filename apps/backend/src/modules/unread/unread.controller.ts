import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { UnreadService } from './unread.service';
import { ChannelService } from '../channel/channel.service';
import { ApiResponse, UnreadCountResponse } from '@discord-platform/shared';

@Controller()
@UseGuards(JwtGuard)
export class UnreadController {
  constructor(
    private readonly unreadService: UnreadService,
    private readonly channelService: ChannelService,
  ) {}

  @Get('guilds/:guildId/unread')
  async getGuildUnread(
    @Param('guildId') guildId: string,
    @Request() req: { user: { sub: string } },
  ): Promise<ApiResponse<UnreadCountResponse>> {
    const userId = req.user.sub;

    const channels = await this.channelService.getGuildChannels(guildId);
    const channelIds = channels.map((c) => c._id.toString());

    const unreadInfos = await this.unreadService.getUnreadForChannels(
      userId,
      channelIds,
    );

    return {
      data: { channels: unreadInfos },
      statusCode: 200,
    };
  }

  @Post('channels/:channelId/read')
  async markChannelRead(
    @Param('channelId') channelId: string,
    @Request() req: { user: { sub: string } },
  ): Promise<ApiResponse<null>> {
    await this.unreadService.markRead(req.user.sub, channelId);
    return { data: null, statusCode: 200 };
  }
}
