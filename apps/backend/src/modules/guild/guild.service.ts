import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Guild, GuildDocument, GuildModel } from './schemas/guild.schema';
import { Role } from './schemas/role.schema';
import { MemberService } from '../member/member.service';
import {
  CHANNEL,
  CHANNEL_NAME,
  CreateRoleDTO,
  UpdateRoleDTO,
} from '@discord-platform/shared';
import { ChannelService } from '../channel/channel.service';
import { Member, MemberModel } from '../member/schemas/member.schema';

@Injectable()
export class GuildService {
  constructor(
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
    @InjectModel(Member.name) private readonly memberModel: MemberModel,
    @InjectConnection() private readonly connection: Connection,
    private readonly memberService: MemberService,
    private readonly channelService: ChannelService,
  ) {}

  async createGuild(name: string, ownerId: string): Promise<GuildDocument> {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      // 默认的 @everyone 角色已经通过 mongo hook 创建了
      const guild = new this.guildModel({
        name,
        owner: new Types.ObjectId(ownerId),
      });

      await guild.save({ session });

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
      return guild;
    } catch (error) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        `Create guild failed: ${error.message}`,
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
    return guild;
  }

  async createRole(
    guildId: string,
    roleData: CreateRoleDTO,
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
        return guild;
      } catch (error) {
        if (error.name === 'VersionError' && attempt < MAX_RETRIES - 1) {
          attempt++;
          continue;
        }
        throw error;
      }
    }
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

        return guild;
      } catch (error) {
        if (error.name === 'VersionError' && attempt < MAX_RETRIES - 1) {
          attempt++;
          continue;
        }
        throw error;
      }
    }
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
        const guild = await this.guildModel
          .findById(guildId)
          .select('roles')
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

        return guild;
      } catch (error) {
        if (error.name === 'VersionError' && attempt < MAX_RETRIES - 1) {
          attempt++;
          continue;
        }
        throw error;
      }
    }
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
}
