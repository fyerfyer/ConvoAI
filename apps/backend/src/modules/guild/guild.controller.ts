import {
  Controller,
  Post,
  UseGuards,
  Body,
  Get,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { GuildService } from './guild.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/permission.decorator';
import {
  CreateRoleDTO,
  JwtPayload,
  PERMISSIONS,
  UpdateRoleDTO,
} from '@discord-platform/shared';
import { User } from '../../common/decorators/user.decorator';

@Controller('guilds')
@UseGuards(JwtGuard, PermissionGuard)
export class GuildController {
  constructor(private readonly guildService: GuildService) {}

  @Post()
  async createGuild(@User() user: JwtPayload, @Body('name') name: string) {
    return this.guildService.createGuild(name, user.sub);
  }

  @Get(':guildId')
  async getGuild(@Param('guildId') guildId: string) {
    return this.guildService.getGuildById(guildId);
  }

  @Post(':guildId/roles')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async createRole(
    @Param('guildId') guildId: string,
    @Body() createRoleDTO: CreateRoleDTO,
  ) {
    return this.guildService.createRole(guildId, createRoleDTO);
  }

  @Patch(':guildId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async updateRole(
    @User() user: JwtPayload,
    @Param('guildId') guildId: string,
    @Param('roleId') roleId: string,
    @Body() updateRoleDTO: UpdateRoleDTO,
  ) {
    return this.guildService.updateRole(
      guildId,
      roleId,
      user.sub,
      updateRoleDTO,
    );
  }

  @Delete(':guildId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async deleteRole(
    @Param('guildId') guildId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.guildService.deleteRole(guildId, roleId);
  }
}
