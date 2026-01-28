import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberService } from '../../modules/member/member.service';
import { JwtService } from '@nestjs/jwt';
import {
  JwtPayload,
  PermissionUtil,
  PermissionValue,
} from '@discord-platform/shared';
import { PERMISSIONS_KEY } from '../decorators/permission.decorator';
import { GuildService } from '../../modules/guild/guild.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private memberService: MemberService,
    private guildService: GuildService,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission =
      this.reflector.getAllAndOverride<PermissionValue>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    // 如果没有标记，直接放行
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    let user: JwtPayload;
    try {
      const token = authHeader.slice(7);
      user = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token', error);
    }

    const guildId =
      request.params.guildId || request.body.guildId || request.query.guildId;

    if (!guildId) {
      throw new ForbiddenException(
        'Guild context missing for permission check',
      );
    }

    // 手动校验一下 Owner 权限
    // 因为创建完 Guild 后可能还没有 Member 记录
    const guild = await this.guildService.getGuildById(guildId);
    if (!guild) {
      throw new ForbiddenException('Guild not found');
    }

    if (guild._id.toString() === user.sub) {
      return true;
    }

    const channelId =
      request.params.channelId ||
      request.body.channelId ||
      request.query.channelId ||
      null;

    const isMember = await this.memberService.isMemberInGuild(
      guildId,
      user.sub,
    );

    if (!isMember) {
      throw new ForbiddenException('You are not a member of this guild');
    }

    const permissions = await this.memberService.getMemberPermissions(
      guildId,
      user.sub,
      channelId,
    );
    const hasPermission = PermissionUtil.has(permissions, requiredPermission);
    if (!hasPermission) {
      throw new ForbiddenException('Missing Permissions');
    }

    return true;
  }
}
