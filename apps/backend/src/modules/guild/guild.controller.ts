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
  GuildListResponse,
  ChannelListResponse,
  ApiResponse,
  createGuildSchema,
} from '@discord-platform/shared';
import { ChannelService } from '../channel/channel.service';
import { User } from '../../common/decorators/user.decorator';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { HttpStatus } from '@nestjs/common';

@Controller('guilds')
@UseGuards(JwtGuard)
export class GuildController {
  constructor(
    private readonly guildService: GuildService,
    private readonly channelService: ChannelService,
  ) {}

  @Post()
  async createGuild(
    @User() user: JwtPayload,
    @Body(new ZodValidationPipe(createGuildSchema))
    createGuildDTO: CreateGuildDTO,
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

  @Get()
  async getUserGuilds(
    @User() user: JwtPayload,
  ): Promise<ApiResponse<GuildListResponse>> {
    const guilds = await this.guildService.getUserGuilds(user.sub);
    return {
      data: {
        guilds: guilds.map((g) => this.guildService.toGuildResponse(g)),
      },
      statusCode: HttpStatus.OK,
    };
  }

  @Get(':guildId')
  @UseGuards(PermissionGuard)
  async getGuild(
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<GuildResponse>> {
    const guild = await this.guildService.getGuildById(guildId);
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.OK,
    };
  }

  @Get(':guildId/channels')
  @UseGuards(PermissionGuard)
  async getGuildChannels(
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<ChannelListResponse>> {
    const channels = await this.channelService.getGuildChannels(guildId);
    return {
      data: {
        channels: channels.map((c) => this.channelService.toChannelResponse(c)),
      },
      statusCode: HttpStatus.OK,
    };
  }

  @Post(':guildId/roles')
  @UseGuards(PermissionGuard)
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
  @UseGuards(PermissionGuard)
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
  @UseGuards(PermissionGuard)
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
