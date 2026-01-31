import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { ChannelService } from './channel.service';
import {
  Channel,
  channelSchema,
  ChannelDocument,
} from './schemas/channel.schema';
import { MemberService } from '../member/member.service';
import {
  Member,
  memberSchema,
  MemberDocument,
} from '../member/schemas/member.schema';
import {
  Guild,
  guildSchema,
  GuildDocument,
} from '../guild/schemas/guild.schema';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  BaseFixturesHelper,
  GuildFixturesHelper,
  MemberFixturesHelper,
  ChannelFixturesHelper,
} from '../../test/helpers/fixtures';
import {
  CHANNEL,
  PERMISSIONS,
  PERMISSIONOVERWRITE,
  CreateChannelDTO,
  UpdateChannelDTO,
  CHANNEL_NAME,
} from '@discord-platform/shared';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('ChannelService', () => {
  let module: TestingModule;
  let channelService: ChannelService;
  let guildModel: Model<GuildDocument>;
  let memberModel: Model<MemberDocument>;
  let channelModel: Model<ChannelDocument>;
  let guildFixtures: GuildFixturesHelper;
  let memberFixtures: MemberFixturesHelper;
  let channelFixtures: ChannelFixturesHelper;

  beforeAll(async () => {
    // Connect to test infrastructure
    await TestDatabaseHelper.connect();
    await TestRedisHelper.connect();

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018';
    const dbName = process.env.MONGODB_NAME || 'discord-test';

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: path.resolve(__dirname, '../../../.env.test'),
          isGlobal: true,
        }),
        MongooseModule.forRoot(`${mongoUri}/${dbName}`),
        MongooseModule.forFeature([
          { name: Guild.name, schema: guildSchema },
          { name: Member.name, schema: memberSchema },
          { name: Channel.name, schema: channelSchema },
        ]),
      ],
      providers: [
        ChannelService,
        MemberService,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    channelService = module.get<ChannelService>(ChannelService);
    guildModel = module.get<Model<GuildDocument>>(getModelToken(Guild.name));
    memberModel = module.get<Model<MemberDocument>>(getModelToken(Member.name));
    channelModel = module.get<Model<ChannelDocument>>(
      getModelToken(Channel.name),
    );

    guildFixtures = new GuildFixturesHelper(guildModel);
    memberFixtures = new MemberFixturesHelper(memberModel);
    channelFixtures = new ChannelFixturesHelper(channelModel);
  });

  afterAll(async () => {
    await module.close();
    await TestDatabaseHelper.disconnect();
    await TestRedisHelper.disconnect();
  });

  beforeEach(async () => {
    // Clear database and Redis before each test
    await TestDatabaseHelper.clearDatabase();
    await TestRedisHelper.clearRedis();
  });

  describe('createChannel', () => {
    it('should create a text channel successfully', async () => {
      // Arrange: Create a guild where the user is the owner
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const createChannelDTO: CreateChannelDTO = {
        name: CHANNEL_NAME.GENERAL,
        type: CHANNEL.GUILD_TEXT,
        topic: 'Welcome to general chat',
      };

      // Act
      const channel = await channelService.createChannel(
        guild._id.toString(),
        ownerId.toString(),
        createChannelDTO,
      );

      // Assert
      expect(channel).toBeDefined();
      expect(channel.name).toBe(CHANNEL_NAME.GENERAL);
      expect(channel.type).toBe(CHANNEL.GUILD_TEXT);
      expect(channel.topic).toBe('Welcome to general chat');
      expect(channel.guild.toString()).toBe(guild._id.toString());
      expect(channel.position).toBe(0);
    });

    it('should create a voice channel successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const createChannelDTO: CreateChannelDTO = {
        name: 'voice-room',
        type: CHANNEL.GUILD_VOICE,
        userLimit: 10,
      };

      const channel = await channelService.createChannel(
        guild._id.toString(),
        ownerId.toString(),
        createChannelDTO,
      );

      expect(channel.name).toBe('voice-room');
      expect(channel.type).toBe(CHANNEL.GUILD_VOICE);
    });

    it('should create a category channel successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const createChannelDTO: CreateChannelDTO = {
        name: 'Text Channels',
        type: CHANNEL.GUILD_CATEGORY,
      };

      const channel = await channelService.createChannel(
        guild._id.toString(),
        ownerId.toString(),
        createChannelDTO,
      );

      expect(channel.name).toBe('Text Channels');
      expect(channel.type).toBe(CHANNEL.GUILD_CATEGORY);
    });

    it('should inherit permission overwrites from parent category', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const roleId = guild.roles[0]._id.toString(); // @everyone role

      // Create a category with permission overwrites
      const categoryOverwrites = [
        {
          id: roleId,
          type: PERMISSIONOVERWRITE.ROLE,
          allow: PERMISSIONS.SEND_MESSAGES,
          deny: PERMISSIONS.EMBED_LINKS,
        },
      ];

      const category = await channelFixtures.createTestChannel({
        name: 'Private Category',
        type: CHANNEL.GUILD_CATEGORY,
        guildId: guild._id,
        permissionOverwrites: categoryOverwrites,
      });

      // Create a channel under the category (without explicit overwrites)
      const createChannelDTO: CreateChannelDTO = {
        name: 'private-channel',
        type: CHANNEL.GUILD_TEXT,
        parentId: category._id.toString(),
      };

      const channel = await channelService.createChannel(
        guild._id.toString(),
        ownerId.toString(),
        createChannelDTO,
      );

      // Channel should inherit parent's permission overwrites
      expect(channel.permissionOverwrites).toHaveLength(1);
      expect(channel.permissionOverwrites[0].id).toBe(roleId);
      expect(channel.permissionOverwrites[0].allow).toBe(
        PERMISSIONS.SEND_MESSAGES,
      );
      expect(channel.permissionOverwrites[0].deny).toBe(
        PERMISSIONS.EMBED_LINKS,
      );
    });

    it('should use custom permission overwrites instead of inheriting', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const roleId = guild.roles[0]._id.toString();

      // Create category with overwrites
      const category = await channelFixtures.createTestChannel({
        name: 'Category',
        type: CHANNEL.GUILD_CATEGORY,
        guildId: guild._id,
        permissionOverwrites: [
          {
            id: roleId,
            type: PERMISSIONOVERWRITE.ROLE,
            allow: PERMISSIONS.SEND_MESSAGES,
            deny: 0,
          },
        ],
      });

      // Create channel with explicit (different) overwrites
      const customOverwrites = [
        {
          id: roleId,
          type: PERMISSIONOVERWRITE.ROLE,
          allow: 0,
          deny: PERMISSIONS.VIEW_CHANNELS,
        },
      ];

      const createChannelDTO: CreateChannelDTO = {
        name: 'custom-channel',
        type: CHANNEL.GUILD_TEXT,
        parentId: category._id.toString(),
        permissionOverwrites: customOverwrites,
      };

      const channel = await channelService.createChannel(
        guild._id.toString(),
        ownerId.toString(),
        createChannelDTO,
      );

      // Should use custom overwrites, not inherited from parent
      expect(channel.permissionOverwrites).toHaveLength(1);
      expect(channel.permissionOverwrites[0].deny).toBe(
        PERMISSIONS.VIEW_CHANNELS,
      );
      expect(channel.permissionOverwrites[0].allow).toBe(0);
    });

    it('should throw ForbiddenException when user lacks MANAGE_GUILD permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const regularUserId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Create a regular member without MANAGE_GUILD permission
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: regularUserId,
      });

      const createChannelDTO: CreateChannelDTO = {
        name: 'test-channel',
        type: CHANNEL.GUILD_TEXT,
      };

      await expect(
        channelService.createChannel(
          guild._id.toString(),
          regularUserId.toString(),
          createChannelDTO,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when parent channel does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const nonExistentParentId = BaseFixturesHelper.generateObjectId();

      const createChannelDTO: CreateChannelDTO = {
        name: 'orphan-channel',
        type: CHANNEL.GUILD_TEXT,
        parentId: nonExistentParentId.toString(),
      };

      await expect(
        channelService.createChannel(
          guild._id.toString(),
          ownerId.toString(),
          createChannelDTO,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when parent channel belongs to different guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild1 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 1',
      });
      const guild2 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 2',
      });

      // Create a category in guild2
      const categoryInGuild2 = await channelFixtures.createTestChannel({
        name: 'Category',
        type: CHANNEL.GUILD_CATEGORY,
        guildId: guild2._id,
      });

      // Try to create a channel in guild1 with parent from guild2
      const createChannelDTO: CreateChannelDTO = {
        name: 'cross-guild-channel',
        type: CHANNEL.GUILD_TEXT,
        parentId: categoryInGuild2._id.toString(),
      };

      await expect(
        channelService.createChannel(
          guild1._id.toString(),
          ownerId.toString(),
          createChannelDTO,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should trim whitespace from channel name', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const createChannelDTO: CreateChannelDTO = {
        name: '  general  ',
        type: CHANNEL.GUILD_TEXT,
      };

      const channel = await channelService.createChannel(
        guild._id.toString(),
        ownerId.toString(),
        createChannelDTO,
      );

      expect(channel.name).toBe(CHANNEL_NAME.GENERAL);
    });
  });

  describe('getChannelById', () => {
    it('should return channel when it exists', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const existingChannel = await channelFixtures.createTestChannel({
        name: 'test-channel',
        guildId: guild._id,
      });

      const channel = await channelService.getChannelById(
        existingChannel._id.toString(),
      );

      expect(channel).toBeDefined();
      expect(channel._id.toString()).toBe(existingChannel._id.toString());
      expect(channel.name).toBe('test-channel');
    });

    it('should throw NotFoundException when channel does not exist', async () => {
      const nonExistentId = BaseFixturesHelper.generateObjectId();

      await expect(
        channelService.getChannelById(nonExistentId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getGuildChannels', () => {
    it('should return all channels in a guild sorted by position', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Create channels with different positions
      await channelFixtures.createTestChannel({
        name: 'channel-3',
        guildId: guild._id,
        position: 3,
      });
      await channelFixtures.createTestChannel({
        name: 'channel-1',
        guildId: guild._id,
        position: 1,
      });
      await channelFixtures.createTestChannel({
        name: 'channel-2',
        guildId: guild._id,
        position: 2,
      });

      const channels = await channelService.getGuildChannels(
        guild._id.toString(),
      );

      expect(channels).toHaveLength(3);
      expect(channels[0].name).toBe('channel-1');
      expect(channels[1].name).toBe('channel-2');
      expect(channels[2].name).toBe('channel-3');
    });

    it('should return empty array when guild has no channels', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const channels = await channelService.getGuildChannels(
        guild._id.toString(),
      );

      expect(channels).toEqual([]);
    });

    it('should not return channels from other guilds', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild1 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 1',
      });
      const guild2 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 2',
      });

      await channelFixtures.createTestChannel({
        name: 'guild1-channel',
        guildId: guild1._id,
      });
      await channelFixtures.createTestChannel({
        name: 'guild2-channel',
        guildId: guild2._id,
      });

      const channels = await channelService.getGuildChannels(
        guild1._id.toString(),
      );

      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe('guild1-channel');
    });
  });

  describe('updateChannel', () => {
    it('should update channel name', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'old-name',
        guildId: guild._id,
      });

      const updateDTO: UpdateChannelDTO = { name: 'new-name' };
      const updated = await channelService.updateChannel(
        channel._id.toString(),
        ownerId.toString(),
        updateDTO,
      );

      expect(updated.name).toBe('new-name');
    });

    it('should update channel topic', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
        topic: 'old topic',
      });

      const updateDTO: UpdateChannelDTO = { topic: 'new topic' };
      const updated = await channelService.updateChannel(
        channel._id.toString(),
        ownerId.toString(),
        updateDTO,
      );

      expect(updated.topic).toBe('new topic');
    });

    it('should update channel parent', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const category = await channelFixtures.createTestChannel({
        name: 'Category',
        type: CHANNEL.GUILD_CATEGORY,
        guildId: guild._id,
      });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
      });

      const updateDTO: UpdateChannelDTO = { parentId: category._id.toString() };
      const updated = await channelService.updateChannel(
        channel._id.toString(),
        ownerId.toString(),
        updateDTO,
      );

      expect(updated.parentId?.toString()).toBe(category._id.toString());
    });

    it('should update channel position', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
        position: 0,
      });

      const updateDTO: UpdateChannelDTO = { position: 5 };
      const updated = await channelService.updateChannel(
        channel._id.toString(),
        ownerId.toString(),
        updateDTO,
      );

      expect(updated.position).toBe(5);
    });

    it('should update voice channel userLimit', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'voice',
        type: CHANNEL.GUILD_VOICE,
        guildId: guild._id,
        userLimit: 5,
      });

      const updateDTO: UpdateChannelDTO = { userLimit: 10 };
      const updated = await channelService.updateChannel(
        channel._id.toString(),
        ownerId.toString(),
        updateDTO,
      );

      expect(updated.userLimit).toBe(10);
    });

    it('should throw ForbiddenException when user lacks MANAGE_GUILD permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const regularUserId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: regularUserId,
      });

      const updateDTO: UpdateChannelDTO = { name: 'hacked' };

      await expect(
        channelService.updateChannel(
          channel._id.toString(),
          regularUserId.toString(),
          updateDTO,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when channel does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonExistentId = BaseFixturesHelper.generateObjectId();

      const updateDTO: UpdateChannelDTO = { name: 'test' };

      await expect(
        channelService.updateChannel(
          nonExistentId.toString(),
          ownerId.toString(),
          updateDTO,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when parent belongs to different guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild1 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 1',
      });
      const guild2 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 2',
      });

      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild1._id,
      });
      const categoryInGuild2 = await channelFixtures.createTestChannel({
        name: 'Category',
        type: CHANNEL.GUILD_CATEGORY,
        guildId: guild2._id,
      });

      const updateDTO: UpdateChannelDTO = {
        parentId: categoryInGuild2._id.toString(),
      };

      await expect(
        channelService.updateChannel(
          channel._id.toString(),
          ownerId.toString(),
          updateDTO,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should trim whitespace from updated name', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'old',
        guildId: guild._id,
      });

      const updateDTO: UpdateChannelDTO = { name: '  trimmed  ' };
      const updated = await channelService.updateChannel(
        channel._id.toString(),
        ownerId.toString(),
        updateDTO,
      );

      expect(updated.name).toBe('trimmed');
    });
  });

  describe('deleteChannel', () => {
    it('should delete channel successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'to-delete',
        guildId: guild._id,
      });

      await channelService.deleteChannel(
        channel._id.toString(),
        ownerId.toString(),
      );

      // Verify channel is deleted
      const deletedChannel = await channelModel.findById(channel._id);
      expect(deletedChannel).toBeNull();
    });

    it('should throw ForbiddenException when user lacks MANAGE_GUILD permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const regularUserId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'protected',
        guildId: guild._id,
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: regularUserId,
      });

      await expect(
        channelService.deleteChannel(
          channel._id.toString(),
          regularUserId.toString(),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when channel does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonExistentId = BaseFixturesHelper.generateObjectId();

      await expect(
        channelService.deleteChannel(
          nonExistentId.toString(),
          ownerId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addPermissionOverwrite', () => {
    it('should add a new role permission overwrite', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
      });

      const roleId = guild.roles[0]._id.toString(); // @everyone role
      const overwrite = {
        id: roleId,
        type: PERMISSIONOVERWRITE.ROLE,
        allow: PERMISSIONS.SEND_MESSAGES,
        deny: PERMISSIONS.EMBED_LINKS,
      };

      const updated = await channelService.addPermissionOverwrite(
        channel._id.toString(),
        ownerId.toString(),
        overwrite,
      );

      expect(updated.permissionOverwrites).toHaveLength(1);
      expect(updated.permissionOverwrites[0].id).toBe(roleId);
      expect(updated.permissionOverwrites[0].type).toBe(
        PERMISSIONOVERWRITE.ROLE,
      );
      expect(updated.permissionOverwrites[0].allow).toBe(
        PERMISSIONS.SEND_MESSAGES,
      );
      expect(updated.permissionOverwrites[0].deny).toBe(
        PERMISSIONS.EMBED_LINKS,
      );
    });

    it('should add a new member permission overwrite', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const memberId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
      });

      const overwrite = {
        id: memberId.toString(),
        type: PERMISSIONOVERWRITE.MEMBER,
        allow: PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
        deny: 0,
      };

      const updated = await channelService.addPermissionOverwrite(
        channel._id.toString(),
        ownerId.toString(),
        overwrite,
      );

      expect(updated.permissionOverwrites).toHaveLength(1);
      expect(updated.permissionOverwrites[0].type).toBe(
        PERMISSIONOVERWRITE.MEMBER,
      );
    });

    it('should update existing permission overwrite', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const roleId = guild.roles[0]._id.toString();

      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
        permissionOverwrites: [
          {
            id: roleId,
            type: PERMISSIONOVERWRITE.ROLE,
            allow: PERMISSIONS.VIEW_CHANNELS,
            deny: 0,
          },
        ],
      });

      // Update the existing overwrite
      const newOverwrite = {
        id: roleId,
        type: PERMISSIONOVERWRITE.ROLE,
        allow: PERMISSIONS.SEND_MESSAGES,
        deny: PERMISSIONS.EMBED_LINKS,
      };

      const updated = await channelService.addPermissionOverwrite(
        channel._id.toString(),
        ownerId.toString(),
        newOverwrite,
      );

      // Should still have only 1 overwrite (updated, not added)
      expect(updated.permissionOverwrites).toHaveLength(1);
      expect(updated.permissionOverwrites[0].allow).toBe(
        PERMISSIONS.SEND_MESSAGES,
      );
      expect(updated.permissionOverwrites[0].deny).toBe(
        PERMISSIONS.EMBED_LINKS,
      );
    });

    it('should throw ForbiddenException when user lacks MANAGE_GUILD permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const regularUserId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: regularUserId,
      });

      const overwrite = {
        id: guild.roles[0]._id.toString(),
        type: PERMISSIONOVERWRITE.ROLE,
        allow: PERMISSIONS.ADMINISTRATOR,
        deny: 0,
      };

      await expect(
        channelService.addPermissionOverwrite(
          channel._id.toString(),
          regularUserId.toString(),
          overwrite,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when channel does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const nonExistentId = BaseFixturesHelper.generateObjectId();

      const overwrite = {
        id: guild.roles[0]._id.toString(),
        type: PERMISSIONOVERWRITE.ROLE,
        allow: 0,
        deny: 0,
      };

      await expect(
        channelService.addPermissionOverwrite(
          nonExistentId.toString(),
          ownerId.toString(),
          overwrite,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkAccess', () => {
    it('should return true when user has VIEW_CHANNELS permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
      });

      // Create member (will have @everyone permissions which includes VIEW_CHANNELS)
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      const hasAccess = await channelService.checkAccess(
        userId.toString(),
        channel._id.toString(),
      );

      expect(hasAccess).toBe(true);
    });

    it('should return false when user lacks VIEW_CHANNELS permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'private',
        guildId: guild._id,
        permissionOverwrites: [
          {
            id: guild.roles[0]._id.toString(), // @everyone
            type: PERMISSIONOVERWRITE.ROLE,
            allow: 0,
            deny: PERMISSIONS.VIEW_CHANNELS,
          },
        ],
      });

      // Create member (has @everyone role which is denied VIEW_CHANNELS in this channel)
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      const hasAccess = await channelService.checkAccess(
        userId.toString(),
        channel._id.toString(),
      );

      expect(hasAccess).toBe(false);
    });

    it('should return false when channel does not exist', async () => {
      const userId = BaseFixturesHelper.generateObjectId();
      const nonExistentChannelId = BaseFixturesHelper.generateObjectId();

      const hasAccess = await channelService.checkAccess(
        userId.toString(),
        nonExistentChannelId.toString(),
      );

      expect(hasAccess).toBe(false);
    });

    it('should return true for guild owner even without explicit permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'private',
        guildId: guild._id,
        permissionOverwrites: [
          {
            id: guild.roles[0]._id.toString(),
            type: PERMISSIONOVERWRITE.ROLE,
            allow: 0,
            deny: PERMISSIONS.VIEW_CHANNELS,
          },
        ],
      });

      // Owner should always have access (ADMINISTRATOR permission)
      const hasAccess = await channelService.checkAccess(
        ownerId.toString(),
        channel._id.toString(),
      );

      expect(hasAccess).toBe(true);
    });

    it('should return false when user is not a member of the guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonMemberUserId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        name: 'test',
        guildId: guild._id,
      });

      // User is not a member of the guild
      const hasAccess = await channelService.checkAccess(
        nonMemberUserId.toString(),
        channel._id.toString(),
      );

      expect(hasAccess).toBe(false);
    });
  });
});
