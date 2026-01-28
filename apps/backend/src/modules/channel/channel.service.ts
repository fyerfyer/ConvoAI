import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Channel,
  ChannelDocument,
  ChannelModel,
} from './schemas/channel.schema';
import {
  CHANNEL,
  CreateChannelDTO,
  PermissionOverwriteDTO,
  PERMISSIONS,
  PermissionUtil,
  UpdateChannelDTO,
} from '@discord-platform/shared';
import { ClientSession, Types } from 'mongoose';
import { MemberService } from '../member/member.service';

@Injectable()
export class ChannelService {
  constructor(
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
    private readonly memberService: MemberService,
  ) {}

  async createChannel(
    guildId: string,
    userId: string,
    createChannelDTO: CreateChannelDTO,
    session?: ClientSession,
  ): Promise<ChannelDocument> {
    const guildObjectId = new Types.ObjectId(guildId);
    const permissions = await this.memberService.getMemberPermissions(
      guildId,
      userId,
      undefined,
      session,
    );

    if (!PermissionUtil.has(permissions, PERMISSIONS.MANAGE_GUILD)) {
      throw new ForbiddenException(
        'You do not have permission to create channels',
      );
    }

    let initialOverwrites = createChannelDTO.permissionOverwrites;

    if (createChannelDTO.parentId) {
      const parentObjectId = new Types.ObjectId(createChannelDTO.parentId);
      const parent = await this.channelModel
        .findById(parentObjectId)
        .session(session);
      if (!parent || !parent.guild.equals(guildObjectId)) {
        throw new BadRequestException('Invalid parent channel');
      }

      if (parent.type === CHANNEL.GUILD_CATEGORY && !initialOverwrites) {
        initialOverwrites = parent.permissionOverwrites.map((po) => ({
          id: po.id,
          type: po.type,
          allow: po.allow,
          deny: po.deny,
        }));
      }
    }

    const channel = new this.channelModel({
      name: createChannelDTO.name.trim(),
      type: createChannelDTO.type || CHANNEL.GUILD_TEXT,
      guild: guildObjectId,
      topic: createChannelDTO.topic || null,
      parentId: createChannelDTO.parentId
        ? new Types.ObjectId(createChannelDTO.parentId)
        : null,
      permissionOverwrites: initialOverwrites,
      position: 0,
    });

    return channel.save({ session });
  }

  async getChannelById(
    channelId: string,
    session?: ClientSession,
  ): Promise<ChannelDocument> {
    const channel = await this.channelModel
      .findById(channelId)
      .session(session);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }

  async getGuildChannels(guildId: string): Promise<ChannelDocument[]> {
    const guildObjectId = new Types.ObjectId(guildId);
    return this.channelModel
      .find({
        guild: guildObjectId,
      })
      .sort({ position: 1 });
  }

  async updateChannel(
    channelId: string,
    userId: string,
    updateChannelDTO: UpdateChannelDTO,
    session?: ClientSession,
  ): Promise<ChannelDocument> {
    const channel = await this.channelModel
      .findById(channelId)
      .session(session);
    if (!channel) {
      throw new BadRequestException('Channel not found');
    }

    const permissions = await this.memberService.getMemberPermissions(
      channel.guild.toString(),
      userId,
    );
    if (!PermissionUtil.has(permissions, PERMISSIONS.MANAGE_GUILD)) {
      throw new ForbiddenException(
        'You do not have permission to update channels',
      );
    }

    if (updateChannelDTO.name) {
      channel.name = updateChannelDTO.name.trim();
    }
    if (updateChannelDTO.topic !== undefined) {
      channel.topic = updateChannelDTO.topic;
    }
    if (updateChannelDTO.parentId) {
      const parentObjectId = new Types.ObjectId(updateChannelDTO.parentId);
      const parent = await this.channelModel
        .findById(parentObjectId)
        .session(session);
      if (!parent || !parent.guild.equals(channel.guild)) {
        throw new BadRequestException('Invalid parent channel');
      }

      channel.parentId = parentObjectId;
    }
    if (updateChannelDTO.userLimit !== undefined) {
      channel.userLimit = updateChannelDTO.userLimit;
    }
    if (updateChannelDTO.position !== undefined) {
      channel.position = updateChannelDTO.position;
    }

    return channel.save({ session });
  }

  async deleteChannel(
    channelId: string,
    userId: string,
    session?: ClientSession,
  ) {
    const channel = await this.channelModel
      .findById(channelId)
      .session(session);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const permissions = await this.memberService.getMemberPermissions(
      channel.guild.toString(),
      userId,
      undefined,
      session,
    );
    if (!PermissionUtil.has(permissions, PERMISSIONS.MANAGE_GUILD)) {
      throw new ForbiddenException(
        'You do not have permission to delete channels',
      );
    }

    await this.channelModel.findByIdAndDelete(channelId).session(session);
  }

  async addPermissionOverwrite(
    channelId: string,
    userId: string,
    permissionOverwriteDTO: PermissionOverwriteDTO,
    session?: ClientSession,
  ): Promise<ChannelDocument> {
    const channel = await this.channelModel
      .findById(channelId)
      .session(session);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const permissions = await this.memberService.getMemberPermissions(
      channel.guild.toString(),
      userId,
      undefined,
      session,
    );
    if (!PermissionUtil.has(permissions, PERMISSIONS.MANAGE_GUILD)) {
      throw new ForbiddenException(
        'You do not have permission to manage channel permissions',
      );
    }

    // 检查是否已存在相关覆写
    const existingIndex = channel.permissionOverwrites.findIndex(
      (ow) =>
        ow.id === permissionOverwriteDTO.id &&
        ow.type === permissionOverwriteDTO.type,
    );

    if (existingIndex !== -1) {
      channel.permissionOverwrites[existingIndex] = permissionOverwriteDTO;
    } else {
      channel.permissionOverwrites.push(permissionOverwriteDTO);
    }

    return channel.save({ session });
  }
}
