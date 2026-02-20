import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Guild, GuildDocument, GuildModel } from './schemas/guild.schema';
import { Invite, InviteModel } from './schemas/invite.schema';
import { Role } from './schemas/role.schema';
import { MemberService } from '../member/member.service';
import {
  CHANNEL,
  CHANNEL_NAME,
  CreateInviteDTO,
  CreateRoleDTO,
  DEFAULT_EVERYONE_PERMISSIONS,
  ROLE_CONSTANTS,
  UpdateRoleDTO,
} from '@discord-platform/shared';
import { ChannelService } from '../channel/channel.service';
import { Member, MemberModel } from '../member/schemas/member.schema';
import { AppLogger } from '../../common/configs/logger/logger.service';
import * as crypto from 'crypto';

@Injectable()
export class GuildService {
  constructor(
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
    @InjectModel(Member.name) private readonly memberModel: MemberModel,
    @InjectModel(Invite.name) private readonly inviteModel: InviteModel,
    @InjectConnection() private readonly connection: Connection,
    private readonly memberService: MemberService,
    private readonly channelService: ChannelService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(GuildService.name);
  }

  async createGuild(name: string, ownerId: string): Promise<GuildDocument> {
    this.logger.log('Creating new guild', { name, ownerId });
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      // 默认的 @everyone 角色已经通过 mongo hook 创建了
      const guild = new this.guildModel({
        name,
        owner: new Types.ObjectId(ownerId),
      });

      await guild.save({ session });
      this.logger.log('Guild created successfully', {
        guildId: guild._id.toString(),
        name,
      });

      const generalChannel = await this.channelService.createChannel(
        guild._id.toString(),
        ownerId,
        {
          name: CHANNEL_NAME.GENERAL,
          type: CHANNEL.GUILD_TEXT,
        },
        session,
      );

      guild.systemChannelId = generalChannel._id;
      await guild.save();

      // 将 Owner 加入 Member 表，并赋予管理员逻辑
      await this.memberService.addMemberToGuild(
        guild.id,
        ownerId,
        undefined,
        session,
      );

      await session.commitTransaction();
      this.logger.log('Guild creation completed', {
        guildId: guild._id.toString(),
      });
      return guild;
    } catch (error) {
      await session.abortTransaction();
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        'Failed to create guild',
        { name, ownerId, error: errorMessage },
        errorStack,
      );
      throw new InternalServerErrorException(
        `Create guild failed: ${errorMessage}`,
      );
    } finally {
      await session.endSession();
    }
  }

  async getGuildById(
    guildId: string,
    session?: ClientSession,
  ): Promise<GuildDocument> {
    const guild = await this.guildModel.findById(guildId).session(session);
    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    // TODO：everyone 角色好像有些问题，这里先手动检查注入
    const hasEveryoneRole = guild.roles.some(
      (role) => role.name === ROLE_CONSTANTS.EVERYONE,
    );

    if (!hasEveryoneRole) {
      guild.roles.push({
        name: ROLE_CONSTANTS.EVERYONE,
        permissions: DEFAULT_EVERYONE_PERMISSIONS,
        color: '#99AAB5',
        position: 0,
        hoist: false,
        mentionable: false,
      });
      await guild.save({ session });
    }

    return guild;
  }

  async createRole(
    guildId: string,
    roleData: CreateRoleDTO,
    session?: ClientSession,
  ): Promise<GuildDocument> {
    this.logger.log('Creating role', { guildId, roleName: roleData.name });
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const guild = await this.guildModel.findById(guildId).session(session);
        if (!guild) {
          this.logger.warn('Guild not found for role creation', { guildId });
          throw new NotFoundException('Guild not found');
        }

        // position 越大越靠前显示，@everyone 始终为 0
        // 新角色默认插入到最低等级 (position 1)，位于 @everyone (0) 之上
        // 为此，我们需要将所有非默认角色的位置上移一位以腾出空间
        const newPosition = 1;
        guild.roles.forEach((r) => {
          if (r.position >= newPosition) {
            r.position += 1;
          }
        });

        const newRole: Role = {
          name: roleData.name, // 必需字段
          permissions: roleData.permissions || 0,
          color: roleData.color || '#99AAB5',
          position: newPosition,
          hoist: roleData.hoist || false,
          mentionable: roleData.mentionable || false,
        };

        guild.roles.push(newRole);
        await guild.save({ session });
        this.logger.log('Role created successfully', {
          guildId,
          roleName: roleData.name,
        });
        return guild;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'VersionError' &&
          attempt < MAX_RETRIES - 1
        ) {
          attempt++;
          this.logger.warn('Version conflict, retrying role creation', {
            guildId,
            attempt,
          });
          continue;
        }
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          'Failed to create role',
          { guildId, roleData, error: errorMessage },
          errorStack,
        );
        throw error;
      }
    }
    throw new InternalServerErrorException(
      'Failed to create role after max retries',
    );
  }

  async updateRole(
    guildId: string,
    roleId: string,
    operatorId: string,
    updateData: UpdateRoleDTO,
    session?: ClientSession,
  ): Promise<GuildDocument> {
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const guild = await this.guildModel
          .findById(guildId)
          .select('roles owner')
          .session(session);
        if (!guild) {
          throw new NotFoundException('Guild not found');
        }

        const role = guild.roles.find(
          (r) => r._id.toString() === roleId.toString(),
        );
        if (!role) {
          throw new NotFoundException('Role not found');
        }

        const operatorMaxPosition = await this.getMemberHigestRolePosition(
          guildId,
          operatorId,
        );

        if (role.position >= operatorMaxPosition) {
          throw new BadRequestException(
            'Cannot modify a role equal to or higher than your highest role',
          );
        }

        if (
          role.name === '@everyone' &&
          updateData.name &&
          updateData.name !== '@everyone'
        ) {
          throw new BadRequestException('Cannot rename the @everyone role');
        }

        if (updateData.name) role.name = updateData.name;
        if (updateData.permissions) role.permissions = updateData.permissions;
        if (updateData.color) role.color = updateData.color;
        if (updateData.hoist !== undefined) role.hoist = updateData.hoist;
        if (updateData.mentionable !== undefined)
          role.mentionable = updateData.mentionable;

        await guild.save({ session });

        // 修改 Role 权限，升级整个 Guild 的权限版本号，废弃所有旧缓存
        await this.memberService.invalidateGuildPermissions(guildId);
        this.logger.log('Role updated and permissions invalidated', {
          guildId,
          roleId,
        });

        return guild;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'VersionError' &&
          attempt < MAX_RETRIES - 1
        ) {
          attempt++;
          this.logger.warn('Version conflict, retrying role update', {
            guildId,
            roleId,
            attempt,
          });
          continue;
        }
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          'Failed to update role',
          { guildId, roleId, error: errorMessage },
          errorStack,
        );
        throw error;
      }
    }
    throw new InternalServerErrorException(
      'Failed to update role after max retries',
    );
  }

  async deleteRole(
    guildId: string,
    roleId: string,
    session?: ClientSession,
  ): Promise<GuildDocument> {
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const guild = await this.guildModel.findById(guildId).session(session);
        if (!guild) {
          throw new NotFoundException('Guild not found');
        }

        const role = guild.roles.find(
          (r) => r._id.toString() === roleId.toString(),
        );
        if (!role) {
          throw new NotFoundException('Role not found');
        }

        if (role.name === '@everyone') {
          throw new BadRequestException('Cannot delete the @everyone role');
        }

        // 在删除角色前，先从所有成员中移除该角色
        guild.roles.pull(roleId);
        await this.memberModel
          .updateMany(
            {
              guild: guild._id,
              roles: new Types.ObjectId(roleId),
            },
            { $pull: { roles: new Types.ObjectId(roleId) } },
          )
          .session(session);

        await guild.save({ session });

        // 删除 Role，升级整个 Guild 的权限版本号
        await this.memberService.invalidateGuildPermissions(guildId);
        this.logger.log('Role deleted and permissions invalidated', {
          guildId,
          roleId,
        });

        return guild;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'VersionError' &&
          attempt < MAX_RETRIES - 1
        ) {
          attempt++;
          this.logger.warn('Version conflict, retrying role deletion', {
            guildId,
            roleId,
            attempt,
          });
          continue;
        }
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          'Failed to delete role',
          { guildId, roleId, error: errorMessage },
          errorStack,
        );
        throw error;
      }
    }
    throw new InternalServerErrorException(
      'Failed to delete role after max retries',
    );
  }

  async getMemberHigestRolePosition(
    guildId: string,
    userId: string,
  ): Promise<number> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);

    const guild = await this.guildModel
      .findById(guildObjectId)
      .select('roles owner')
      .lean();
    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    if (guild.owner.toString() === userId) {
      return Number.MAX_SAFE_INTEGER;
    }

    const member = await this.memberModel
      .findOne({
        guild: guildObjectId,
        user: userObjectId,
      })
      .select('roles')
      .lean();

    if (!member || member.roles.length === 0) {
      return 0;
    }

    let highestPosition = 0;
    for (const roleId of member.roles) {
      const role = guild.roles.find(
        (r) => r._id.toString() === roleId.toString(),
      );
      if (role && role.position > highestPosition) {
        highestPosition = role.position;
      }
    }

    return highestPosition;
  }

  async getUserGuilds(userId: string): Promise<GuildDocument[]> {
    const userObjectId = new Types.ObjectId(userId);
    const members = await this.memberModel
      .find({ user: userObjectId })
      .select('guild')
      .lean();

    const guildIds = members.map((m) => new Types.ObjectId(m.guild.toString()));
    if (guildIds.length === 0) return [];

    return this.guildModel.find({ _id: { $in: guildIds } });
  }

  toGuildResponse(guild: GuildDocument) {
    return {
      id: guild._id.toString(),
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.owner.toString(),
      roles: (guild.roles || []).map((r) => ({
        id: r._id.toString(),
        name: r.name,
        permissions: r.permissions,
        color: r.color,
        position: r.position,
        hoist: r.hoist,
        mentionable: r.mentionable,
      })),
      createdAt: guild.createdAt.toISOString(),
      updatedAt: guild.updatedAt.toISOString(),
    };
  }

  async toGuildResponseWithMemberCount(guild: GuildDocument) {
    const memberCount = await this.memberModel.countDocuments({
      guild: guild._id,
    });
    return {
      ...this.toGuildResponse(guild),
      memberCount,
    };
  }

  async searchGuilds(
    query: string,
    limit = 20,
    offset = 0,
  ): Promise<{ guilds: GuildDocument[]; total: number }> {
    const filter = {
      name: { $regex: query, $options: 'i' },
    };
    const [guilds, total] = await Promise.all([
      this.guildModel.find(filter).skip(offset).limit(limit).sort({ name: 1 }),
      this.guildModel.countDocuments(filter),
    ]);
    return { guilds, total };
  }

  async joinGuild(guildId: string, userId: string) {
    this.logger.log('User joining guild', { guildId, userId });
    const guild = await this.getGuildById(guildId);
    const isMember = await this.memberService.isMemberInGuild(guildId, userId);
    if (isMember) {
      throw new BadRequestException('You are already a member of this guild');
    }
    await this.memberService.addMemberToGuild(guildId, userId);
    this.logger.log('User joined guild successfully', { guildId, userId });
    return guild;
  }

  private generateInviteCode(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  async createInvite(guildId: string, inviterId: string, dto: CreateInviteDTO) {
    const guild = await this.getGuildById(guildId);

    const code = this.generateInviteCode();
    const expiresAt =
      dto.maxAge && dto.maxAge > 0
        ? new Date(Date.now() + dto.maxAge * 1000)
        : null;

    const invite = new this.inviteModel({
      code,
      guild: guild._id,
      inviter: new Types.ObjectId(inviterId),
      maxUses: dto.maxUses || 0,
      expiresAt,
    });

    await invite.save();
    this.logger.log('Invite created', { guildId, code });
    return invite;
  }

  async getGuildInvites(guildId: string) {
    return this.inviteModel
      .find({ guild: new Types.ObjectId(guildId) })
      .populate('inviter', 'name avatar')
      .populate('guild')
      .sort({ createdAt: -1 });
  }

  async getInviteByCode(code: string) {
    const invite = await this.inviteModel
      .findOne({ code })
      .populate('inviter', 'name avatar')
      .populate('guild');

    if (!invite) {
      throw new NotFoundException('Invite not found or expired');
    }

    // Check expiration
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      await invite.deleteOne();
      throw new BadRequestException('This invite has expired');
    }

    // Check max uses
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      throw new BadRequestException(
        'This invite has reached its maximum number of uses',
      );
    }

    return invite;
  }

  async useInvite(code: string, userId: string) {
    const invite = await this.getInviteByCode(code);
    const guildId = invite.guild._id.toString();

    const isMember = await this.memberService.isMemberInGuild(guildId, userId);
    if (isMember) {
      throw new BadRequestException('You are already a member of this guild');
    }

    await this.memberService.addMemberToGuild(guildId, userId);

    invite.uses += 1;
    await invite.save();

    this.logger.log('Invite used', { code, userId, guildId });

    const guild = await this.getGuildById(guildId);
    return guild;
  }

  async deleteInvite(guildId: string, code: string) {
    const result = await this.inviteModel.deleteOne({
      code,
      guild: new Types.ObjectId(guildId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Invite not found');
    }
  }
}
