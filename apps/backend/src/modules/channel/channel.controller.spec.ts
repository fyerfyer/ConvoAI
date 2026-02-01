import { Test, TestingModule } from '@nestjs/testing';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { MemberService } from '../member/member.service';
import { GuildService } from '../guild/guild.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import {
  Channel,
  ChannelDocument,
  channelSchema,
} from './schemas/channel.schema';
import {
  Member,
  MemberDocument,
  memberSchema,
} from '../member/schemas/member.schema';
import {
  Guild,
  GuildDocument,
  guildSchema,
} from '../guild/schemas/guild.schema';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  BaseFixturesHelper,
  ChannelFixturesHelper,
  GuildFixturesHelper,
  MemberFixturesHelper,
} from '../../test/helpers/fixtures';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { Model } from 'mongoose';
import {
  CHANNEL,
  CreateChannelDTO,
  JwtPayload,
  UpdateChannelDTO,
} from '@discord-platform/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('ChannelController', () => {
  let module: TestingModule;
  let controller: ChannelController;
  let guildModel: Model<GuildDocument>;
  let memberModel: Model<MemberDocument>;
  let channelModel: Model<ChannelDocument>;
  let guildFixtures: GuildFixturesHelper;
  let memberFixtures: MemberFixturesHelper;
  let channelFixtures: ChannelFixturesHelper;

  beforeAll(async () => {
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
      controllers: [ChannelController],
      providers: [
        ChannelService,
        MemberService,
        GuildService,
        JwtService,
        Reflector,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    controller = module.get<ChannelController>(ChannelController);
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
    await TestDatabaseHelper.clearDatabase();
    await TestRedisHelper.clearRedis();
  });

  const createMockUser = (userId: string): JwtPayload => ({
    sub: userId,
    email: 'test@example.com',
    name: 'testuser',
    isBot: false,
  });

  describe('createChannel', () => {
    it('should create a channel successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const user = createMockUser(ownerId.toString());

      const createChannelDTO: CreateChannelDTO = {
        name: 'new-channel',
        type: CHANNEL.GUILD_TEXT,
      };

      const result = await controller.createChannel(
        user,
        guild._id.toString(),
        createChannelDTO,
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('new-channel');
      expect(result.guild.toString()).toBe(guild._id.toString());
    });

    it('should throw ForbiddenException if user lacks permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const memberId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
      });

      const user = createMockUser(memberId.toString());
      const createChannelDTO: CreateChannelDTO = {
        name: 'hacker-channel',
        type: CHANNEL.GUILD_TEXT,
      };

      await expect(
        controller.createChannel(user, guild._id.toString(), createChannelDTO),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateChannel', () => {
    it('should update channel successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
        name: 'old-name',
      });
      const user = createMockUser(ownerId.toString());

      const updateDTO: UpdateChannelDTO = {
        name: 'new-name',
        topic: 'updated topic',
      };

      const result = await controller.updateChannel(
        user,
        channel._id.toString(),
        updateDTO,
      );

      expect(result.name).toBe('new-name');
      expect(result.topic).toBe('updated topic');
    });

    it('should throw ForbiddenException if user lacks permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const memberId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
        name: 'protected',
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
      });

      const user = createMockUser(memberId.toString());
      const updateDTO: UpdateChannelDTO = { name: 'hacked' };

      await expect(
        controller.updateChannel(user, channel._id.toString(), updateDTO),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteChannel', () => {
    it('should delete channel successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
        name: 'to-delete',
      });
      const user = createMockUser(ownerId.toString());

      await controller.deleteChannel(user, channel._id.toString());

      const deleted = await channelModel.findById(channel._id);
      expect(deleted).toBeNull();
    });

    it('should throw ForbiddenException if user lacks permission', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const memberId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
        name: 'protected',
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
      });

      const user = createMockUser(memberId.toString());

      await expect(
        controller.deleteChannel(user, channel._id.toString()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if channel does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonExistentId = BaseFixturesHelper.generateObjectId();
      const user = createMockUser(ownerId.toString());

      await expect(
        controller.deleteChannel(user, nonExistentId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
