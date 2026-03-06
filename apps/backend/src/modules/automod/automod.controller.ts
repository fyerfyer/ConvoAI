import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/permission.decorator';

import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import {
  PERMISSIONS,
  ApiResponse,
  AutoModConfigResponse,
  AutoModLogListResponse,
  updateAutomodConfigSchema,
  UpdateAutoModConfigDTO,
} from '@discord-platform/shared';
import { AutoModService } from './services/automod.service';
import { MemberService } from '../member/member.service';
import { UserDocument } from '../user/schemas/user.schema';

@Controller('guilds/:guildId/automod')
@UseGuards(JwtGuard)
export class AutoModController {
  constructor(
    private readonly autoModService: AutoModService,
    private readonly memberService: MemberService,
  ) {}

  @Get('config')
  @UseGuards(PermissionGuard)
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async getConfig(
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<AutoModConfigResponse>> {
    const config = await this.autoModService.getConfig(guildId);
    return {
      data: config,
      statusCode: HttpStatus.OK,
    };
  }

  @Put('config')
  @UseGuards(PermissionGuard)
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async updateConfig(
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(updateAutomodConfigSchema))
    dto: UpdateAutoModConfigDTO,
  ): Promise<ApiResponse<AutoModConfigResponse>> {
    await this.autoModService.updateConfig(guildId, dto);
    const config = await this.autoModService.getConfig(guildId);
    return {
      data: config,
      statusCode: HttpStatus.OK,
      message: 'AutoMod configuration updated',
    };
  }

  @Get('logs')
  @UseGuards(PermissionGuard)
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async getLogs(
    @Param('guildId') guildId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<ApiResponse<AutoModLogListResponse>> {
    const { logs, total } = await this.autoModService.getLogs(
      guildId,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );

    // Resolve user names
    const userMap = new Map<string, string>();
    try {
      const members = await this.memberService.getGuildMembers(guildId);
      for (const m of members) {
        const user = m.user as unknown as UserDocument;
        if (user?._id) {
          userMap.set(user._id.toString(), user.name || 'Unknown');
        }
      }
    } catch {
      // ignore - userMap will remain empty, names will show as 'Unknown'
    }

    return {
      data: {
        logs: logs.map((log) => ({
          id: (
            log as unknown as { _id: { toString(): string } }
          )._id.toString(),
          guildId: log.guildId.toString(),
          channelId: log.channelId.toString(),
          userId: log.userId.toString(),
          userName: userMap.get(log.userId.toString()) || 'Unknown',
          trigger: log.trigger,
          reason: log.reason,
          actions: log.actions,
          messageContent: log.messageContent,
          toxicityScores: log.toxicityScores,
          createdAt: log.createdAt?.toISOString() || new Date().toISOString(),
        })),
        total,
      },
      statusCode: HttpStatus.OK,
    };
  }
}
