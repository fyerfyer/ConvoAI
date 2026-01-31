import { Types, Model } from 'mongoose';
import { PERMISSIONS } from '@discord-platform/shared';
import { GuildDocument } from '../../../../modules/guild/schemas/guild.schema';

export interface CreateTestGuildOptions {
  name?: string;
  ownerId?: string | Types.ObjectId;
  roles?: Array<{
    name: string;
    permissions: number;
    color?: string;
    position?: number;
    hoist?: boolean;
    mentionable?: boolean;
  }>;
}

export class GuildFixturesHelper {
  constructor(private guildModel: Model<GuildDocument>) {}

  async createTestGuild(
    options: CreateTestGuildOptions = {},
  ): Promise<GuildDocument> {
    const {
      name = `Test Guild ${Date.now()}`,
      ownerId = new Types.ObjectId(),
      roles = [],
    } = options;

    const ownerObjectId =
      typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    // Default @everyone role will be added by schema pre-save hook
    const guild = new this.guildModel({
      name,
      owner: ownerObjectId,
      roles:
        roles.length > 0
          ? roles.map((r) => ({
              name: r.name,
              permissions: r.permissions,
              color: r.color || '#99AAB5',
              position: r.position || 0,
              hoist: r.hoist || false,
              mentionable: r.mentionable || false,
            }))
          : [], // Let the pre-save hook add @everyone
    });

    return guild.save();
  }

  createAdminRoleData(
    name = 'Admin',
    additionalPermissions = 0,
  ): {
    name: string;
    permissions: number;
    color: string;
    position: number;
    hoist: boolean;
    mentionable: boolean;
  } {
    return {
      name,
      permissions: PERMISSIONS.MANAGE_GUILD | additionalPermissions,
      color: '#FF0000',
      position: 1,
      hoist: true,
      mentionable: false,
    };
  }
}
