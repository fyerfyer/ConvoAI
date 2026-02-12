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
import { AppLogger } from '../../common/configs/logger/logger.service';

@Injectable()
export class ChannelService {
  constructor(
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
    private readonly memberService: MemberService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ChannelService.name);
  }

  async createChannel(
    guildId: string,
    userId: string,
    createChannelDTO: CreateChannelDTO,
    session?: ClientSession,
  ): Promise<ChannelDocument> {
    this.logger.log('Creating channel', {
      guildId,
      userId,
      channelName: createChannelDTO.name,
    });
    const guildObjectId = new Types.ObjectId(guildId);
    const permissions = await this.memberService.getMemberPermissions(
      guildId,
      userId,
      undefined,
      session,
    );

    if (!PermissionUtil.has(permissions, PERMISSIONS.MANAGE_GUILD)) {
      this.logger.warn('Permission denied for channel creation', {
        guildId,
        userId,
      });
      throw new ForbiddenException(
        'You do not have permission to create channels',
      );
    }

    let initialOverwrites = createChannelDTO.permissionOverwrites;

    if (createChannelDTO.parentId) {
      const parentObjectId = new Types.ObjectId(createChannelDTO.parentId);
      const parent = await this.channelModel
        .findById(parentObjectId)
        .select('guild type permissionOverwrites')
        .lean()
        .session(session);
      if (!parent || !(parent.guild as Types.ObjectId).equals(guildObjectId)) {
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

    const savedChannel = await channel.save({ session });
    this.logger.log('Channel created successfully', {
      guildId,
      channelId: savedChannel._id.toString(),
      channelName: savedChannel.name,
    });
    return savedChannel;
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
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const channel = await this.channelModel
          .findById(channelId)
          .session(session);
        if (!channel) {
          throw new BadRequestException('Channel not found');
        }

        const permissions = await this.memberService.getMemberPermissions(
          (channel.guild as Types.ObjectId).toString(),
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
            .select('guild')
            .lean()
            .session(session);
          if (
            !parent ||
            !(parent.guild as Types.ObjectId).equals(
              channel.guild as Types.ObjectId,
            )
          ) {
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

        return await channel.save({ session });
      } catch (error) {
        if (error.name === 'VersionError' && attempt < MAX_RETRIES - 1) {
          attempt++;
          this.logger.warn('Version conflict, retrying channel update', {
            channelId,
            attempt,
          });
          continue;
        }
        this.logger.error(
          'Failed to update channel',
          { channelId, error: error.message },
          error.stack,
        );
        throw error;
      }
    }
  }

  async deleteChannel(
    channelId: string,
    userId: string,
    session?: ClientSession,
  ) {
    this.logger.log('Deleting channel', { channelId, userId });
    const channel = await this.channelModel
      .findById(channelId)
      .session(session);
    if (!channel) {
      this.logger.warn('Channel not found for deletion', { channelId });
      throw new NotFoundException('Channel not found');
    }

    const permissions = await this.memberService.getMemberPermissions(
      (channel.guild as Types.ObjectId).toString(),
      userId,
      undefined,
      session,
    );
    if (!PermissionUtil.has(permissions, PERMISSIONS.MANAGE_GUILD)) {
      this.logger.warn('Permission denied for channel deletion', {
        channelId,
        userId,
      });
      throw new ForbiddenException(
        'You do not have permission to delete channels',
      );
    }

    await this.channelModel.findByIdAndDelete(channelId).session(session);
    this.logger.log('Channel deleted successfully', { channelId });
  }

  async addPermissionOverwrite(
    channelId: string,
    userId: string,
    permissionOverwriteDTO: PermissionOverwriteDTO,
    session?: ClientSession,
  ): Promise<ChannelDocument> {
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const channel = await this.channelModel
          .findById(channelId)
          .session(session);
        if (!channel) {
          throw new NotFoundException('Channel not found');
        }

        const permissions = await this.memberService.getMemberPermissions(
          (channel.guild as Types.ObjectId).toString(),
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

        await channel.save({ session });

        // 修改 Channel 权限覆写，升级整个 Guild 的权限版本号
        await this.memberService.invalidateGuildPermissions(
          (channel.guild as Types.ObjectId).toString(),
        );
        this.logger.log('Permission overwrite added', {
          channelId,
          targetId: permissionOverwriteDTO.id,
        });

        return channel;
      } catch (error) {
        if (error.name === 'VersionError' && attempt < MAX_RETRIES - 1) {
          attempt++;
          this.logger.warn('Version conflict, retrying permission overwrite', {
            channelId,
            attempt,
          });
          continue;
        }
        this.logger.error(
          'Failed to add permission overwrite',
          { channelId, error: error.message },
          error.stack,
        );
        throw error;
      }
    }
  }

  async checkAccess(userId: string, channelId: string): Promise<boolean> {
    const channel = await this.channelModel.findById(channelId);
    if (!channel) return false;

    const permissions = await this.memberService.getMemberPermissions(
      (channel.guild as Types.ObjectId).toString(),
      userId,
      channelId,
    );
    return PermissionUtil.has(permissions, PERMISSIONS.VIEW_CHANNELS);
  }

  public toChannelResponse(channel: ChannelDocument) {
    return {
      id: channel._id.toString(),
      name: channel.name,
      type: channel.type,
      guildId: (channel.guild as Types.ObjectId).toString(),
      position: channel.position,
      parentId: channel.parentId?.toString(),
      createdAt: channel.createdAt?.toISOString(),
      updatedAt: channel.updatedAt?.toISOString(),
    };
  }
}
