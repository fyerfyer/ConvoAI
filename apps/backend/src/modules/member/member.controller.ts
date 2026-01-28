import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { MemberService } from './member.service';
import { RequirePermissions } from '../../common/decorators/permission.decorator';
import { JwtPayload, PERMISSIONS } from '@discord-platform/shared';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { User } from '../../common/decorators/user.decorator';

@Controller('guilds/:guildId/members')
@UseGuards(JwtGuard, PermissionGuard)
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_CHANNELS)
  async getMembers(@Param('guildId') guildId: string) {
    return this.memberService.getGuildMembers(guildId);
  }

  @Get(':userId')
  @RequirePermissions(PERMISSIONS.VIEW_CHANNELS)
  async getMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ) {
    return this.memberService.getUserMembers(guildId, userId);
  }

  @Patch('@me/nick')
  async updateMyNickname(
    @Param('guildId') guildId: string,
    @User() user: JwtPayload,
    @Body('nickName') nickName: string,
  ) {
    return this.memberService.updateMemberNickname(guildId, user.sub, nickName);
  }

  @Delete(':userId')
  @RequirePermissions(PERMISSIONS.KICK_MEMBERS)
  async kickMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ) {
    return this.memberService.removeMemberFromGuild(guildId, userId);
  }

  @Delete('@me')
  async leaveGuild(
    @Param('guildId') guildId: string,
    @User() user: JwtPayload,
  ) {
    return this.memberService.removeMemberFromGuild(guildId, user.sub);
  }
}
