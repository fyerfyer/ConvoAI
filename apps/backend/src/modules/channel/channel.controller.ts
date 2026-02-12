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
  createChannelSchema,
  updateChannelSchema,
  ApiResponse,
  ChannelResponse,
} from '@discord-platform/shared';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { HttpStatus } from '@nestjs/common';
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
    @Body(new ZodValidationPipe(createChannelSchema))
    createChannelDTO: CreateChannelDTO,
  ): Promise<ApiResponse<ChannelResponse>> {
    const channel = await this.channelService.createChannel(
      guildId,
      user.sub,
      createChannelDTO,
    );
    return {
      data: this.channelService.toChannelResponse(channel),
      statusCode: HttpStatus.CREATED,
      message: 'Channel created successfully',
    };
  }

  @Patch(':channelId')
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async updateChannel(
    @User() user: JwtPayload,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema))
    updateChannelDTO: UpdateChannelDTO,
  ): Promise<ApiResponse<ChannelResponse>> {
    const channel = await this.channelService.updateChannel(
      channelId,
      user.sub,
      updateChannelDTO,
    );
    return {
      data: this.channelService.toChannelResponse(channel),
      statusCode: HttpStatus.OK,
      message: 'Channel updated successfully',
    };
  }

  @Delete(':channelId')
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async deleteChannel(
    @User() user: JwtPayload,
    @Param('channelId') channelId: string,
  ): Promise<ApiResponse<null>> {
    await this.channelService.deleteChannel(channelId, user.sub);
    return {
      statusCode: HttpStatus.OK,
      message: 'Channel deleted successfully',
    };
  }
}
