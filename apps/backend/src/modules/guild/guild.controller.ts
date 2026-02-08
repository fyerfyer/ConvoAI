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
  CreateGuildDTO,
  GuildResponse,
  ApiResponse,
  createGuildSchema,
} from '@discord-platform/shared';
import { User } from '../../common/decorators/user.decorator';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { HttpStatus, UsePipes } from '@nestjs/common';

@Controller('guilds')
@UseGuards(JwtGuard, PermissionGuard)
export class GuildController {
  constructor(private readonly guildService: GuildService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createGuildSchema))
  async createGuild(
    @User() user: JwtPayload,
    @Body() createGuildDTO: CreateGuildDTO,
  ): Promise<ApiResponse<GuildResponse>> {
    const guild = await this.guildService.createGuild(
      createGuildDTO.name,
      user.sub,
    );
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.CREATED,
      message: 'Guild created successfully',
    };
  }

  @Get(':guildId')
  async getGuild(
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<GuildResponse>> {
    const guild = await this.guildService.getGuildById(guildId);
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.OK,
    };
  }

  @Post(':guildId/roles')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async createRole(
    @Param('guildId') guildId: string,
    @Body() createRoleDTO: CreateRoleDTO,
  ): Promise<ApiResponse<GuildResponse>> {
    const guild = await this.guildService.createRole(guildId, createRoleDTO);
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.CREATED,
      message: 'Role created successfully',
    };
  }

  @Patch(':guildId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async updateRole(
    @User() user: JwtPayload,
    @Param('guildId') guildId: string,
    @Param('roleId') roleId: string,
    @Body() updateRoleDTO: UpdateRoleDTO,
  ): Promise<ApiResponse<GuildResponse>> {
    await this.guildService.updateRole(
      guildId,
      roleId,
      user.sub,
      updateRoleDTO,
    );

    const guild = await this.guildService.getGuildById(guildId);
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.OK,
      message: 'Role updated successfully',
    };
  }

  @Delete(':guildId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async deleteRole(
    @Param('guildId') guildId: string,
    @Param('roleId') roleId: string,
  ): Promise<ApiResponse<GuildResponse>> {
    const guild = await this.guildService.deleteRole(guildId, roleId);
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.OK,
      message: 'Role deleted successfully',
    };
  }
}
