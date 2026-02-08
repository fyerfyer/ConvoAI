import { Test, TestingModule } from '@nestjs/testing';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';
import { ChannelService } from '../channel/channel.service';
import { GuildService } from '../guild/guild.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Member, MemberModel, memberSchema } from './schemas/member.schema';
import { User, UserModel, userSchema } from '../user/schemas/user.schema';
import { Guild, GuildModel, guildSchema } from '../guild/schemas/guild.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  BaseFixturesHelper,
  GuildFixturesHelper,
  MemberFixturesHelper,
  UserFixturesHelper,
} from '../../test/helpers/fixtures';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { JwtPayload } from '@discord-platform/shared';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('MemberController', () => {
  let module: TestingModule;
  let controller: MemberController;
  let guildModel: GuildModel;
  let memberModel: MemberModel;
  let userModel: UserModel;
  let guildFixtures: GuildFixturesHelper;
  let memberFixtures: MemberFixturesHelper;
  let userFixtures: UserFixturesHelper;

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
          { name: User.name, schema: userSchema },
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
    guildModel = module.get<GuildModel>(getModelToken(Guild.name));
    memberModel = module.get<MemberModel>(getModelToken(Member.name));
    userModel = module.get<UserModel>(getModelToken(User.name));

    guildFixtures = new GuildFixturesHelper(guildModel);
    memberFixtures = new MemberFixturesHelper(memberModel);
    userFixtures = new UserFixturesHelper(userModel);
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

      // Create actual user documents
      await userFixtures.createTestUser({ _id: member1Id });
      await userFixtures.createTestUser({ _id: member2Id });

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
      expect(result.statusCode).toBe(200);
      expect(result.data.members).toBeDefined();
      expect(result.data.members.length).toBe(2);
    });
  });

  describe('getMember', () => {
    it('should return specific member details', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const memberId = BaseFixturesHelper.generateObjectId();

      // Create actual user document
      await userFixtures.createTestUser({ _id: memberId });

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
      expect(result.statusCode).toBe(200);
      expect(result.data.members).toBeDefined();
      expect(result.data.members.length).toBe(1);
      expect(result.data.members[0].nickname).toBe('Target Member');
      expect(result.data.members[0].user.id).toBe(memberId.toString());
    });
  });

  describe('updateMyNickname', () => {
    it('should update nickname for the current user', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const memberId = BaseFixturesHelper.generateObjectId();

      // Create actual user document
      await userFixtures.createTestUser({ _id: memberId });

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
      expect(result.statusCode).toBe(200);
      expect(result.data.nickname).toBe(newNickname);

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

      // Create actual user document
      await userFixtures.createTestUser({ _id: memberId });

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
