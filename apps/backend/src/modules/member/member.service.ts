import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Member, MemberDocument, MemberModel } from './schemas/member.schema';
import { Guild, GuildModel } from '../guild/schemas/guild.schema';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';
import { ClientSession, Types } from 'mongoose';
import {
  PERMISSIONS,
  PERMISSIONOVERWRITE,
  PermissionUtil,
} from '@discord-platform/shared';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import Redis from 'ioredis';
import {
  RedisKeys,
  CACHE_TTL,
} from '../../common/constants/redis-keys.constant';

// @everyone 当前统一方案
// Member.roles不包含@everyone
// 权限计算时隐式应用@everyone权限
@Injectable()
export class MemberService {
  constructor(
    @InjectModel(Member.name) private readonly memberModel: MemberModel,
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  private getGuildPermKey(
    guildId: string,
    version: string,
    userId: string,
    channelId?: string,
  ): string {
    return RedisKeys.userPermission(guildId, version, userId, channelId);
  }

  private async getGuildPermVersion(guildId: string): Promise<string> {
    const key = RedisKeys.guildPermVersion(guildId);
    const version = await this.redisClient.get(key);
    if (!version) {
      await this.redisClient.set(key, '1');
      return '1';
    }

    return version;
  }

  // 通过自增 Guild 权限版本号，废弃所有旧权限缓存
  async invalidateGuildPermissions(guildId: string): Promise<void> {
    await this.redisClient.incr(RedisKeys.guildPermVersion(guildId));
  }

  // 清除某个用户在某个 Guild 下的所有权限缓存
  private async invalidateUserPermissions(
    guildId: string,
    userId: string,
  ): Promise<void> {
    const version = await this.getGuildPermVersion(guildId);
    const pattern = RedisKeys.userPermissionPattern(guildId, version, userId);

    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } while (cursor !== '0');
  }

  async addMemberToGuild(
    guildId: string,
    userId: string,
    nickName?: string,
    session?: ClientSession,
  ): Promise<MemberDocument> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);
    const guildPromise = this.guildModel
      .findById(guildObjectId)
      .select('_id')
      .lean()
      .session(session);

    const existingMemberPromise = this.memberModel
      .findOne({
        guild: guildObjectId,
        user: userObjectId,
      })
      .session(session);

    const [guild, existingMember] = await Promise.all([
      guildPromise,
      existingMemberPromise,
    ]);

    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    if (existingMember) {
      return existingMember;
    }

    const member = new this.memberModel({
      guild: guildObjectId,
      user: userObjectId,
      nickName,
      roles: [],
    });

    // TODO：目前先让 guild 一直带着 @everyone 角色，不需要给 member 插入额外的东西
    // 在创建 member 后，默认赋予 @everyone 角色
    // 用 hook 需要去关联查询 guild 导致 N+1 问题
    // const everyoneRole = guild.roles.find((r) => r.name === '@everyone');
    // if (!everyoneRole) {
    //   throw new NotFoundException('@everyone role not found in guild');
    // }

    // member.roles.push(everyoneRole._id);

    await member.save({ session });

    return member;
  }

  async removeMemberFromGuild(
    guildId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<void> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);

    await this.memberModel.deleteOne(
      {
        guild: guildObjectId,
        user: userObjectId,
      },
      { session },
    );
  }

  async getUserMembers(
    guildId: string,
    userId: string,
  ): Promise<MemberDocument[]> {
    const userObjectId = new Types.ObjectId(userId);
    const guildObjectId = new Types.ObjectId(guildId);
    return this.memberModel.find({ user: userObjectId, guild: guildObjectId });
  }

  async getGuildMembers(guildId: string): Promise<MemberDocument[]> {
    const guildObjectId = new Types.ObjectId(guildId);
    return this.memberModel.find({ guild: guildObjectId });
  }

  async updateMemberNickname(
    guildId: string,
    userId: string,
    nickname: string,
    session?: ClientSession,
  ): Promise<MemberDocument> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);

    const guild = await this.guildModel
      .findById(guildObjectId)
      .select('_id')
      .lean()
      .session(session);
    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    const updatedMember = await this.memberModel.findOneAndUpdate(
      { guild: guildObjectId, user: userObjectId },
      { nickName: nickname },
      { new: true, session },
    );

    if (!updatedMember) {
      throw new NotFoundException('Member not found in guild');
    }

    return updatedMember;
  }

  async addRoleToMember(
    guildId: string,
    userId: string,
    roleId: string,
    session?: ClientSession,
  ): Promise<MemberDocument> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);
    const roleObjectId = new Types.ObjectId(roleId);

    const guild = await this.guildModel
      .findById(guildObjectId)
      .select('roles')
      .lean()
      .session(session);
    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    const role = guild.roles.find(
      (r) => r._id.toString() === roleObjectId.toString(),
    );
    if (!role) {
      throw new NotFoundException('Role not found in guild');
    }

    const updatedMember = await this.memberModel.findOneAndUpdate(
      { guild: guildObjectId, user: userObjectId },
      { $addToSet: { roles: roleObjectId } },
      { new: true, session },
    );

    if (!updatedMember) {
      throw new NotFoundException('Member not found in guild');
    }

    // 立即清除该用户的缓存
    await this.invalidateUserPermissions(guildId, userId);

    return updatedMember;
  }

  async removeRoleFromMember(
    guildId: string,
    userId: string,
    roleId: string,
    session?: ClientSession,
  ): Promise<MemberDocument> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);
    const roleObjectId = new Types.ObjectId(roleId);

    const updatedMember = await this.memberModel.findOneAndUpdate(
      { guild: guildObjectId, user: userObjectId },
      { $pull: { roles: roleObjectId } },
      { new: true, session },
    );
    if (!updatedMember) {
      throw new NotFoundException('Member not found in guild');
    }

    // 立即清除该用户的缓存
    await this.invalidateUserPermissions(guildId, userId);

    return updatedMember;
  }

  // Permission 分为两种：针对某一频道的和针对整个服务器的
  async getMemberPermissions(
    guildId: string,
    userId: string,
    channelId?: string,
    session?: ClientSession,
  ): Promise<number> {
    const version = await this.getGuildPermVersion(guildId);
    const cacheKey = this.getGuildPermKey(guildId, version, userId, channelId);

    const cached = await this.redisClient.get(cacheKey);
    if (cached) {
      return parseInt(cached, 10);
    }

    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);
    const channelObjectId = channelId ? new Types.ObjectId(channelId) : null;

    // 使用 .lean() 获取纯 JSON 对象，.select() 只获取需要的字段
    const guildPromise = this.guildModel
      .findById(guildObjectId)
      .select('roles owner')
      .lean()
      .session(session);
    const memberPromise = this.memberModel
      .findOne({
        guild: guildObjectId,
        user: userObjectId,
      })
      .select('roles')
      .lean()
      .session(session);
    const channelPromise = channelObjectId
      ? this.channelModel
          .findById(channelObjectId)
          .select('permissionOverwrites')
          .lean()
          .session(session)
      : Promise.resolve(null);

    const [guild, member, channel] = await Promise.all([
      guildPromise,
      memberPromise,
      channelPromise,
    ]);

    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    // 如果是 owner 直接赋予管理员权限
    // 这样创建 guild 过程中即使没将 owner 加入 member 表也有权限
    if (guild.owner.toString() === userId) {
      await this.redisClient.set(
        cacheKey,
        PERMISSIONS.ADMINISTRATOR.toString(),
        'EX',
        CACHE_TTL.PERMISSIONS,
      );
      return PERMISSIONS.ADMINISTRATOR;
    }

    if (!member) {
      // 如果成员不在服务器中，则没有权限
      await this.redisClient.set(cacheKey, '0', 'EX', CACHE_TTL.PERMISSIONS);
      return 0;
    }

    const everyoneRole = guild.roles.find((r) => r.name === '@everyone');

    let permissions = everyoneRole ? everyoneRole.permissions : 0;

    for (const roleId of member.roles) {
      const role = guild.roles.find(
        (r) => r._id.toString() === roleId.toString(),
      );
      if (role) {
        permissions = permissions | role.permissions;
      }
    }

    // 优先检查管理员权限：
    if (PermissionUtil.has(permissions, PERMISSIONS.ADMINISTRATOR)) {
      await this.redisClient.set(
        cacheKey,
        PERMISSIONS.ADMINISTRATOR.toString(),
        'EX',
        CACHE_TTL.PERMISSIONS,
      );
      return permissions;
    }

    // Channel 权限覆写
    if (channelId) {
      if (!channel) {
        await this.redisClient.set(
          cacheKey,
          permissions.toString(),
          'EX',
          CACHE_TTL.PERMISSIONS,
        );
        return permissions;
      }

      // 先进行 @everyone 的权限覆写
      // 因为我们在创建 member 的时候并没有创建 @everyone 角色，member.roles 中没有这个的相关覆写
      // 这个权限是隐式继承的，因此我们需要手动进行相关覆写
      let everyoneRoleAllow = 0;
      let everyoneRoleDeny = 0;
      if (everyoneRole) {
        const overwrite = channel.permissionOverwrites.find(
          (ow) =>
            ow.id === everyoneRole._id.toString() &&
            ow.type === PERMISSIONOVERWRITE.ROLE,
        );
        if (overwrite) {
          everyoneRoleAllow |= overwrite.allow;
          everyoneRoleDeny |= overwrite.deny;
        }
      }

      let roleAllow = everyoneRoleAllow;
      let roleDeny = everyoneRoleDeny;

      // 聚合所有角色的 Allow 和 Deny
      for (const roleId of member.roles) {
        const overwrite = channel.permissionOverwrites.find(
          (ow) =>
            ow.id === roleId.toString() && ow.type === PERMISSIONOVERWRITE.ROLE,
        );

        if (overwrite) {
          roleAllow |= overwrite.allow;
          roleDeny |= overwrite.deny;
        }
      }

      permissions = PermissionUtil.remove(permissions, everyoneRoleDeny);
      permissions = PermissionUtil.add(permissions, everyoneRoleAllow);
      permissions = PermissionUtil.remove(permissions, roleDeny);
      permissions = PermissionUtil.add(permissions, roleAllow);

      // 用户单独的覆盖
      const memberOverwrite = channel.permissionOverwrites.find(
        (ow) => ow.id === userId && ow.type === PERMISSIONOVERWRITE.MEMBER,
      );

      if (memberOverwrite) {
        permissions = PermissionUtil.remove(permissions, memberOverwrite.deny);
        permissions = PermissionUtil.add(permissions, memberOverwrite.allow);
      }
    }

    await this.redisClient.set(
      cacheKey,
      permissions.toString(),
      'EX',
      CACHE_TTL.PERMISSIONS,
    );
    return permissions;
  }

  async isMemberInGuild(
    guildId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);
    const member = await this.memberModel
      .findOne({
        guild: guildObjectId,
        user: userObjectId,
      })
      .session(session);

    return !!member;
  }
}
