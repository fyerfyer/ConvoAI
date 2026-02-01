import { Test, TestingModule } from '@nestjs/testing';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';
import { ChannelService } from '../channel/channel.service';
import { GuildService } from '../guild/guild.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Member, MemberDocument, memberSchema } from './schemas/member.schema';
import {
  Guild,
  GuildDocument,
  guildSchema,
} from '../guild/schemas/guild.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  BaseFixturesHelper,
  GuildFixturesHelper,
  MemberFixturesHelper,
} from '../../test/helpers/fixtures';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { Model } from 'mongoose';
import { JwtPayload } from '@discord-platform/shared';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('MemberController', () => {
  let module: TestingModule;
  let controller: MemberController;
  let guildModel: Model<GuildDocument>;
  let memberModel: Model<MemberDocument>;
  let guildFixtures: GuildFixturesHelper;
  let memberFixtures: MemberFixturesHelper;

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
      controllers: [MemberController],
      providers: [
        MemberService,
        GuildService,
        ChannelService,
        JwtService,
        Reflector,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    controller = module.get<MemberController>(MemberController);
    guildModel = module.get<Model<GuildDocument>>(getModelToken(Guild.name));
    memberModel = module.get<Model<MemberDocument>>(getModelToken(Member.name));

    guildFixtures = new GuildFixturesHelper(guildModel);
    memberFixtures = new MemberFixturesHelper(memberModel);
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

  describe('getMembers', () => {
    it('should return list of members for a guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const member1Id = BaseFixturesHelper.generateObjectId();
      const member2Id = BaseFixturesHelper.generateObjectId();

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: member1Id,
        nickName: 'Member 1',
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: member2Id,
        nickName: 'Member 2',
      });

      const result = await controller.getMembers(guild._id.toString());

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
    });
  });

  describe('getMember', () => {
    it('should return specific member details', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const memberId = BaseFixturesHelper.generateObjectId();

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
        nickName: 'Target Member',
      });

      const result = await controller.getMember(
        guild._id.toString(),
        memberId.toString(),
      );

      expect(result).toBeDefined();
      expect(result[0].nickName).toBe('Target Member');
      expect(result[0].user.toString()).toBe(memberId.toString());
    });
  });

  describe('updateMyNickname', () => {
    it('should update nickname for the current user', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const memberId = BaseFixturesHelper.generateObjectId();

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
        nickName: 'Old Name',
      });

      const user = createMockUser(memberId.toString());
      const newNickname = 'Cool Name';

      const result = await controller.updateMyNickname(
        guild._id.toString(),
        user,
        newNickname,
      );

      expect(result).toBeDefined();
      expect(result.nickName).toBe(newNickname);

      const updatedMember = await memberModel.findOne({
        guild: guild._id,
        user: memberId,
      });
      expect(updatedMember.nickName).toBe(newNickname);
    });
  });

  describe('leaveGuild', () => {
    it('should allow user to leave the guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const memberId = BaseFixturesHelper.generateObjectId();

      const member = await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
      });

      const user = createMockUser(memberId.toString());

      await controller.leaveGuild(guild._id.toString(), user);

      const left = await memberModel.findById(member._id);
      expect(left).toBeNull();
    });
  });
});
