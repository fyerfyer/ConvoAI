import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ChannelService } from './channel.service';
import { RequirePermissions } from '../../common/decorators/permission.decorator';
import {
  CreateChannelDTO,
  JwtPayload,
  PERMISSIONS,
  UpdateChannelDTO,
} from '@discord-platform/shared';
import { User } from '../../common/decorators/user.decorator';

@Controller('channels')
@UseGuards(JwtGuard, PermissionGuard)
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async createChannel(
    @User() user: JwtPayload,
    @Query('guildId') guildId: string,
    @Body() createChannelDTO: CreateChannelDTO,
  ) {
    return this.channelService.createChannel(
      guildId,
      user.sub,
      createChannelDTO,
    );
  }

  @Patch(':channelId')
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async updateChannel(
    @User() user: JwtPayload,
    @Param('channelId') channelId: string,
    @Body() updateChannelDTO: UpdateChannelDTO,
  ) {
    return this.channelService.updateChannel(
      channelId,
      user.sub,
      updateChannelDTO,
    );
  }

  @Delete(':channelId')
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async deleteChannel(
    @User() user: JwtPayload,
    @Param('channelId') channelId: string,
  ) {
    return this.channelService.deleteChannel(channelId, user.sub);
  }
}
