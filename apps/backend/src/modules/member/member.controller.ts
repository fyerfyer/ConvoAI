import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MemberService } from './member.service';
import { RequirePermissions } from '../../common/decorators/permission.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { User } from '../../common/decorators/user.decorator';
import {
  ApiResponse,
  JwtPayload,
  MemberListResponse,
  MemberResponse,
  PermissionResponse,
  PERMISSIONS,
} from '@discord-platform/shared';

@Controller('guilds/:guildId/members')
@UseGuards(JwtGuard, PermissionGuard)
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  async getMembers(
    @Param('guildId') guildId: string,
    @User() user: JwtPayload,
  ): Promise<ApiResponse<MemberListResponse>> {
    const isMember = await this.memberService.isMemberInGuild(
      guildId,
      user.sub,
    );
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this guild');
    }

    const members = await this.memberService.getGuildMembers(guildId);
    return {
      data: {
        members: members.map((m) => this.memberService.toMemberResponse(m)),
      },
      statusCode: HttpStatus.OK,
    };
  }

  // ─── Get my permissions in this guild ──────────────────────
  @Get('@me/permissions')
  async getMyPermissions(
    @Param('guildId') guildId: string,
    @User() user: JwtPayload,
  ): Promise<ApiResponse<PermissionResponse>> {
    const permissions = await this.memberService.getMemberPermissions(
      guildId,
      user.sub,
    );
    return {
      data: { permissions },
      statusCode: HttpStatus.OK,
    };
  }

  @Get(':userId')
  async getMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
    @User() user: JwtPayload,
  ): Promise<ApiResponse<MemberListResponse>> {
    const isMember = await this.memberService.isMemberInGuild(
      guildId,
      user.sub,
    );
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this guild');
    }

    const members = await this.memberService.getUserMembers(guildId, userId);
    if (!members || members.length === 0) {
      throw new NotFoundException('Member not found');
    }
    return {
      data: {
        members: members.map((m) => this.memberService.toMemberResponse(m)),
      },
      statusCode: HttpStatus.OK,
    };
  }

  @Patch('@me/nick')
  async updateMyNickname(
    @Param('guildId') guildId: string,
    @User() user: JwtPayload,
    @Body('nickName') nickName: string,
  ): Promise<ApiResponse<MemberResponse>> {
    const member = await this.memberService.updateMemberNickname(
      guildId,
      user.sub,
      nickName,
    );
    return {
      data: this.memberService.toMemberResponse(member),
      statusCode: HttpStatus.OK,
      message: 'Nickname updated successfully',
    };
  }

  @Delete('@me')
  async leaveGuild(
    @Param('guildId') guildId: string,
    @User() user: JwtPayload,
  ): Promise<ApiResponse<null>> {
    await this.memberService.removeMemberFromGuild(guildId, user.sub);
    return {
      statusCode: HttpStatus.OK,
      message: 'Left guild successfully',
    };
  }

  @Delete(':userId')
  @RequirePermissions(PERMISSIONS.KICK_MEMBERS)
  async kickMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ): Promise<ApiResponse<null>> {
    await this.memberService.removeMemberFromGuild(guildId, userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Member kicked successfully',
    };
  }

  @Post(':userId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async addRoleToMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ): Promise<ApiResponse<MemberResponse>> {
    const member = await this.memberService.addRoleToMember(
      guildId,
      userId,
      roleId,
    );
    const populated = await member.populate('user');
    return {
      data: this.memberService.toMemberResponse(populated),
      statusCode: HttpStatus.OK,
      message: 'Role assigned successfully',
    };
  }

  @Delete(':userId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async removeRoleFromMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ): Promise<ApiResponse<MemberResponse>> {
    const member = await this.memberService.removeRoleFromMember(
      guildId,
      userId,
      roleId,
    );
    const populated = await member.populate('user');
    return {
      data: this.memberService.toMemberResponse(populated),
      statusCode: HttpStatus.OK,
      message: 'Role removed successfully',
    };
  }

  @Post(':userId/mute')
  @RequirePermissions(PERMISSIONS.MUTE_MEMBERS)
  async muteMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
    @Body('duration') duration: number,
  ): Promise<ApiResponse<MemberResponse>> {
    const member = await this.memberService.muteMember(
      guildId,
      userId,
      duration,
    );
    return {
      data: this.memberService.toMemberResponse(member),
      statusCode: HttpStatus.OK,
      message: 'Member muted successfully',
    };
  }

  @Delete(':userId/mute')
  @RequirePermissions(PERMISSIONS.MUTE_MEMBERS)
  async unmuteMember(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ): Promise<ApiResponse<MemberResponse>> {
    const member = await this.memberService.unmuteMember(guildId, userId);
    return {
      data: this.memberService.toMemberResponse(member),
      statusCode: HttpStatus.OK,
      message: 'Member unmuted successfully',
    };
  }
}
