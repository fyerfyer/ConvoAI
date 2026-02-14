import {
  Controller,
  Post,
  UseGuards,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  Query,
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
  CreateInviteDTO,
  GuildResponse,
  GuildListResponse,
  GuildSearchResponse,
  InviteResponse,
  InviteListResponse,
  ChannelListResponse,
  ApiResponse,
  createGuildSchema,
  createInviteSchema,
} from '@discord-platform/shared';
import { ChannelService } from '../channel/channel.service';
import { User } from '../../common/decorators/user.decorator';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';

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

  @Get('search')
  async searchGuilds(
    @Query('q') q: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<ApiResponse<GuildSearchResponse>> {
    const { guilds, total } = await this.guildService.searchGuilds(
      q || '',
      limit ? Number(limit) : 20,
      offset ? Number(offset) : 0,
    );
    const guildResponses = await Promise.all(
      guilds.map((g) => this.guildService.toGuildResponseWithMemberCount(g)),
    );
    return {
      data: { guilds: guildResponses, total },
      statusCode: HttpStatus.OK,
    };
  }

  @Get('invites/:code')
  async getInviteInfo(
    @Param('code') code: string,
  ): Promise<ApiResponse<InviteResponse>> {
    const invite = await this.guildService.getInviteByCode(code);
    const guild = await this.guildService.getGuildById(
      invite.guild._id.toString(),
    );
    const guildWithCount =
      await this.guildService.toGuildResponseWithMemberCount(guild);
    return {
      data: {
        code: invite.code,
        guild: guildWithCount,
        inviter: {
          id:
            (
              invite.inviter as unknown as {
                _id?: Types.ObjectId;
                name?: string;
              }
            )._id?.toString() || invite.inviter.toString(),
          name:
            (
              invite.inviter as unknown as {
                _id?: Types.ObjectId;
                name?: string;
              }
            ).name || 'Unknown',
        },
        uses: invite.uses,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt?.toISOString() || null,
        createdAt: invite.createdAt?.toISOString() || '',
      },
      statusCode: HttpStatus.OK,
    };
  }

  @Post('invites/:code/join')
  async joinViaInvite(
    @User() user: JwtPayload,
    @Param('code') code: string,
  ): Promise<ApiResponse<GuildResponse>> {
    const guild = await this.guildService.useInvite(code, user.sub);
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.OK,
      message: 'Joined guild successfully',
    };
  }

  @Get(':guildId')
  @UseGuards(PermissionGuard)
  @RequirePermissions(PERMISSIONS.VIEW_CHANNELS)
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
  @RequirePermissions(PERMISSIONS.VIEW_CHANNELS)
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

  @Post(':guildId/join')
  async joinGuild(
    @User() user: JwtPayload,
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<GuildResponse>> {
    const guild = await this.guildService.joinGuild(guildId, user.sub);
    return {
      data: this.guildService.toGuildResponse(guild),
      statusCode: HttpStatus.OK,
      message: 'Joined guild successfully',
    };
  }

  @Post(':guildId/invites')
  @UseGuards(PermissionGuard)
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async createInvite(
    @User() user: JwtPayload,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(createInviteSchema))
    dto: CreateInviteDTO,
  ): Promise<ApiResponse<InviteResponse>> {
    const invite = await this.guildService.createInvite(guildId, user.sub, dto);
    const guild = await this.guildService.getGuildById(guildId);
    return {
      data: {
        code: invite.code,
        guild: this.guildService.toGuildResponse(guild),
        inviter: {
          id: user.sub,
          name: '',
        },
        uses: invite.uses,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt?.toISOString() || null,
        createdAt: invite.createdAt?.toISOString() || '',
      },
      statusCode: HttpStatus.CREATED,
      message: 'Invite created successfully',
    };
  }

  @Get(':guildId/invites')
  @UseGuards(PermissionGuard)
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async getGuildInvites(
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<InviteListResponse>> {
    const invites = await this.guildService.getGuildInvites(guildId);
    const guild = await this.guildService.getGuildById(guildId);
    return {
      data: {
        invites: invites.map((inv) => ({
          code: inv.code,
          guild: this.guildService.toGuildResponse(guild),
          inviter: {
            id:
              (
                inv.inviter as unknown as {
                  _id?: Types.ObjectId;
                  name?: string;
                }
              )?._id?.toString() || inv.inviter.toString(),
            name:
              (
                inv.inviter as unknown as {
                  _id?: Types.ObjectId;
                  name?: string;
                }
              )?.name || 'Unknown',
          },
          uses: inv.uses,
          maxUses: inv.maxUses,
          expiresAt: inv.expiresAt?.toISOString() || null,
          createdAt: inv.createdAt?.toISOString() || '',
        })),
      },
      statusCode: HttpStatus.OK,
    };
  }

  @Delete(':guildId/invites/:code')
  @UseGuards(PermissionGuard)
  @RequirePermissions(PERMISSIONS.MANAGE_GUILD)
  async deleteInvite(
    @Param('guildId') guildId: string,
    @Param('code') code: string,
  ): Promise<ApiResponse<null>> {
    await this.guildService.deleteInvite(guildId, code);
    return {
      statusCode: HttpStatus.OK,
      message: 'Invite deleted successfully',
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
