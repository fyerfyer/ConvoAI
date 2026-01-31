import { Types, Model } from 'mongoose';
import {
  CHANNEL,
  ChannelValue,
  PERMISSIONOVERWRITE,
  PermissionOverwriteValue,
} from '@discord-platform/shared';
import { ChannelDocument } from '../../../../modules/channel/schemas/channel.schema';

export interface CreateTestChannelOptions {
  name?: string;
  type?: ChannelValue;
  guildId: string | Types.ObjectId;
  parentId?: string | Types.ObjectId | null;
  topic?: string | null;
  permissionOverwrites?: Array<{
    id: string;
    type: PermissionOverwriteValue;
    allow: number;
    deny: number;
  }>;
  userLimit?: number;
  position?: number;
}

export class ChannelFixturesHelper {
  constructor(private channelModel: Model<ChannelDocument>) {}

  async createTestChannel(
    options: CreateTestChannelOptions,
  ): Promise<ChannelDocument> {
    const {
      name = `test-channel-${Date.now()}`,
      type = CHANNEL.GUILD_TEXT,
      guildId,
      parentId = null,
      topic = null,
      permissionOverwrites = [],
      userLimit = 0,
      position = 0,
    } = options;

    const guildObjectId =
      typeof guildId === 'string' ? new Types.ObjectId(guildId) : guildId;
    const parentObjectId = parentId
      ? typeof parentId === 'string'
        ? new Types.ObjectId(parentId)
        : parentId
      : null;

    const channel = new this.channelModel({
      name,
      type,
      guild: guildObjectId,
      parentId: parentObjectId,
      topic,
      permissionOverwrites,
      userLimit,
      position,
    });

    return channel.save();
  }

  createMemberOverwrite(
    userId: string,
    allow = 0,
    deny = 0,
  ): {
    id: string;
    type: PermissionOverwriteValue;
    allow: number;
    deny: number;
  } {
    return {
      id: userId,
      type: PERMISSIONOVERWRITE.MEMBER,
      allow,
      deny,
    };
  }

  createRoleOverwrite(
    roleId: string,
    allow = 0,
    deny = 0,
  ): {
    id: string;
    type: PermissionOverwriteValue;
    allow: number;
    deny: number;
  } {
    return {
      id: roleId,
      type: PERMISSIONOVERWRITE.ROLE,
      allow,
      deny,
    };
  }
}
