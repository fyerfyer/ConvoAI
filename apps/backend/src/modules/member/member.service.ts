import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Member, MemberDocument, MemberModel } from './schemas/member.schema';
import { Guild, GuildModel } from '../guild/schemas/guild.schema';
import {
  Channel,
  ChannelDocument,
  ChannelModel,
} from '../channel/schemas/channel.schema';
import { ClientSession, Types } from 'mongoose';
import {
  PERMISSIONS,
  PERMISSIONOVERWRITE,
  PermissionUtil,
} from '@discord-platform/shared';

// @everyone 当前统一方案
// Member.roles不包含@everyone
// 权限计算时隐式应用@everyone权限
@Injectable()
export class MemberService {
  constructor(
    @InjectModel(Member.name) private readonly memberModel: MemberModel,
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
  ) {}

  async addMemberToGuild(
    guildId: string,
    userId: string,
    nickName?: string,
    session?: ClientSession,
  ): Promise<MemberDocument> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);

    const guild = await this.guildModel
      .findById(guildObjectId)
      .session(session);

    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    const existingMember = await this.memberModel
      .findOne({
        guild: guildObjectId,
        user: userObjectId,
      })
      .session(session);

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
      .session(session);
    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    const role = guild.roles.id(roleObjectId);
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

    return updatedMember;
  }

  // Permission 分为两种：针对某一频道的和针对整个服务器的
  async getMemberPermissions(
    guildId: string,
    userId: string,
    channelId?: string,
    session?: ClientSession,
  ): Promise<number> {
    const guildObjectId = new Types.ObjectId(guildId);
    const userObjectId = new Types.ObjectId(userId);

    const guild = await this.guildModel
      .findById(guildObjectId)
      .session(session);
    if (!guild) {
      throw new NotFoundException('Guild not found');
    }

    // 如果是 owner 直接赋予管理员权限
    // 这样创建 guild 过程中即使没将 owner 加入 member 表也有权限
    if (guild.owner.toString() === userId) {
      return PERMISSIONS.ADMINISTRATOR;
    }

    const member = await this.memberModel
      .findOne({
        guild: guildObjectId,
        user: userObjectId,
      })
      .session(session);

    if (!member) {
      // 如果成员不在服务器中，则没有权限
      return 0;
    }

    const everyoneRole = guild.roles.find((r) => r.name === '@everyone');

    let permissions = everyoneRole ? everyoneRole.permissions : 0;

    let channel: ChannelDocument;
    if (channelId) {
      channel = await this.channelModel.findById(channelId).session(session);
      if (!channel || !channel.guild.equals(guildObjectId)) return permissions;
    }

    for (const roleId of member.roles) {
      const role = guild.roles.id(roleId);
      if (role) {
        permissions = permissions | role.permissions;
      }
    }

    // 优先检查管理员权限：
    if (PermissionUtil.has(permissions, PERMISSIONS.ADMINISTRATOR)) {
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

    // Channel 权限覆写
    if (channelId && channel) {
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
    } else {
      permissions = PermissionUtil.remove(permissions, everyoneRoleDeny);
      permissions = PermissionUtil.add(permissions, everyoneRoleAllow);
    }

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
