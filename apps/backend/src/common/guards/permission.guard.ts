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
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const params = (request.params ?? {}) as Record<string, unknown>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const query = (request.query ?? {}) as Record<string, unknown>;

    const pathParam = Array.isArray(params.path) ? params.path : [];

    const guildId =
      (typeof params.guildId === 'string' ? params.guildId : undefined) ||
      (typeof body.guildId === 'string' ? body.guildId : undefined) ||
      (typeof query.guildId === 'string' ? query.guildId : undefined) ||
      (typeof pathParam[1] === 'string' ? pathParam[1] : undefined);

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

    if (guild.owner?.toString() === user.sub) {
      return true;
    }

    const channelId =
      (typeof params.channelId === 'string' ? params.channelId : undefined) ||
      (typeof body.channelId === 'string' ? body.channelId : undefined) ||
      (typeof query.channelId === 'string' ? query.channelId : undefined) ||
      (typeof pathParam[1] === 'string' && pathParam[0] === 'channels'
        ? pathParam[1]
        : undefined);

    const isMember = await this.memberService.isMemberInGuild(
      guildId,
      user.sub,
    );

    if (!isMember) {
      throw new ForbiddenException('You are not a member of this guild');
    }

    if (!requiredPermission) {
      return true;
    }

    const permissions = await this.memberService.getMemberPermissions(
      guildId,
      user.sub,
      channelId,
    );

    if (!PermissionUtil.has(permissions, requiredPermission)) {
      throw new ForbiddenException('Permission denied');
    }

    return true;
  }
}
