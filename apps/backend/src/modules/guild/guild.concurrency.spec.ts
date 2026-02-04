import { Test, TestingModule } from '@nestjs/testing';
jest.mock('../../common/configs/redis/redis.module', () => ({
  REDIS_CLIENT: 'REDIS_CLIENT',
}));

import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { GuildService } from './guild.service';
import { Guild, guildSchema, GuildDocument } from './schemas/guild.schema';
import {
  Member,
  memberSchema,
  MemberDocument,
} from '../member/schemas/member.schema';
import {
  Channel,
  channelSchema,
  ChannelDocument,
} from '../channel/schemas/channel.schema';
import { MemberService } from '../member/member.service';
import { ChannelService } from '../channel/channel.service';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import { GuildFixturesHelper } from '../../test/helpers/fixtures';
import { CreateRoleDTO } from '@discord-platform/shared';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('GuildService Concurrency', () => {
  let module: TestingModule;
  let guildService: GuildService;
  let guildModel: Model<GuildDocument>;
  let channelModel: Model<ChannelDocument>;
  let memberModel: Model<MemberDocument>;
  let guildFixtures: GuildFixturesHelper;
  let memberService: MemberService;

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
      providers: [
        GuildService,
        MemberService,
        ChannelService,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    guildService = module.get<GuildService>(GuildService);
    memberService = module.get<MemberService>(MemberService);
    guildModel = module.get<Model<GuildDocument>>(getModelToken(Guild.name));
    channelModel = module.get<Model<ChannelDocument>>(
      getModelToken(Channel.name),
    );
    memberModel = module.get<Model<MemberDocument>>(getModelToken(Member.name));
    guildFixtures = new GuildFixturesHelper(guildModel);
  });

  afterAll(async () => {
    await module.close();
    await TestDatabaseHelper.disconnect();
    await TestRedisHelper.disconnect();
  });

  beforeEach(async () => {
    await TestDatabaseHelper.clearDatabase();
    await TestRedisHelper.clearRedis();
    jest.restoreAllMocks();
  });

  describe('Concurrent createRole', () => {
    it('should handle concurrent role creation requests', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const concurrencyCount = 10;
      const rolePromises = [];

      for (let i = 0; i < concurrencyCount; i++) {
        const roleData: CreateRoleDTO = {
          name: `Role ${i}`,
        };
        rolePromises.push(
          guildService.createRole(guild._id.toString(), roleData),
        );
      }

      const results = await Promise.allSettled(rolePromises);

      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      console.log(
        `CreateRole Concurrency: ${successful.length} success, ${failed.length} failed`,
      );

      // Verify that any failures are due to optimistic locking (VersionError)
      if (failed.length > 0) {
        const firstFail = failed[0] as PromiseRejectedResult;
        // It's possible to get VersionError or "No matching document" (if version mismatch during save)
        expect(firstFail.reason.message).toMatch(
          /VersionError|No matching document/,
        );
      }

      const updatedGuild = await guildModel.findById(guild._id);
      const roles = updatedGuild.roles.filter((r) => r.name !== '@everyone');
      const positions = roles.map((r) => r.position);
      const uniquePositions = new Set(positions);

      // Verify no duplicate positions exist among successful roles
      expect(uniquePositions.size).toBe(positions.length);
      expect(roles.length).toBe(successful.length);
    });
  });

  describe('Concurrent updateRole', () => {
    it('should prevent lost updates via optimistic locking with multiple concurrent requests', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await guildService.createRole(guild._id.toString(), {
        name: 'Target Role',
      });
      const guildWithRole = await guildModel.findById(guild._id);
      const targetRole = guildWithRole.roles.find(
        (r) => r.name === 'Target Role',
      );

      const concurrencyCount = 10;
      const updatePromises = [];

      for (let i = 0; i < concurrencyCount; i++) {
        updatePromises.push(
          guildService.updateRole(
            guild._id.toString(),
            targetRole._id.toString(),
            ownerId,
            { name: `Updated Role Name ${i}` },
          ),
        );
      }

      const results = await Promise.allSettled(updatePromises);
      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      console.log(
        `UpdateRole Concurrency: ${successful.length} success, ${failed.length} failed`,
      );

      if (failed.length > 0) {
        const firstFailure = failed[0] as PromiseRejectedResult;
        expect(firstFailure.reason.message).toMatch(
          /VersionError|No matching document/,
        );
      } else {
        expect(successful.length).toBe(concurrencyCount);
      }

      const finalGuild = await guildModel.findById(guild._id);
      const finalRole = finalGuild.roles.find(
        (r) => r._id.toString() === targetRole._id.toString(),
      );

      if (successful.length > 0) {
        // The final name should match the Update pattern
        expect(finalRole.name).toMatch(/Updated Role Name \d+/);
      }
    });
  });

  describe('createGuild Transaction Rollback', () => {
    it('should rollback guild and channel creation if member creation fails', async () => {
      const ownerId = new Types.ObjectId().toString();

      // Mock memberService.addMemberToGuild to throw an error
      jest
        .spyOn(memberService, 'addMemberToGuild')
        .mockImplementationOnce(async () => {
          throw new Error('Simulated Member Creation Failure');
        });

      try {
        await guildService.createGuild('Rollback Guild', ownerId);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Create guild failed');
      }

      // Verify Rollback
      const guilds = await guildModel.find({ name: 'Rollback Guild' });
      expect(guilds.length).toBe(0);
    });

    it('should rollback channel creation verified by spy', async () => {
      const ownerId = new Types.ObjectId().toString();
      let createdChannelId: string;
      const channelService = module.get<ChannelService>(ChannelService);
      const originalCreateChannel =
        channelService.createChannel.bind(channelService);

      jest
        .spyOn(channelService, 'createChannel')
        .mockImplementationOnce(async (...args) => {
          const result = await originalCreateChannel(...args);
          createdChannelId = result._id.toString();
          return result;
        });

      jest
        .spyOn(memberService, 'addMemberToGuild')
        .mockImplementationOnce(async () => {
          throw new Error('Simulated Fail');
        });

      try {
        await guildService.createGuild('Rollback Guild 2', ownerId);
      } catch {
        // Expect error
      }

      expect(createdChannelId).toBeDefined();

      // Verify that this channel ID does NOT exist in the database
      const channel = await channelModel.findById(createdChannelId);
      expect(channel).toBeNull();

      // Verify Guild does not exist
      const guilds = await guildModel.find({ name: 'Rollback Guild 2' });
      expect(guilds.length).toBe(0);
    });
  });

  describe('deleteRole vs updateRole Conflict', () => {
    it('should handle race condition between delete and update', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await guildService.createRole(guild._id.toString(), {
        name: 'To Delete',
      });

      const guildWithRole = await guildModel.findById(guild._id);
      const roleId = guildWithRole.roles
        .find((r) => r.name === 'To Delete')
        ._id.toString();

      // Create a member and assign this role to them
      const testMemberId = new Types.ObjectId().toString();
      let member = await memberService.addMemberToGuild(
        guild._id.toString(),
        testMemberId,
      );
      member = await memberService.addRoleToMember(
        guild._id.toString(),
        testMemberId,
        roleId,
      );

      expect(member.roles.map((r) => r.toString())).toContain(roleId);

      // Concurrent Delete and Update
      // Delete should eventually win or invalidate update
      const deletePromise = guildService.deleteRole(
        guild._id.toString(),
        roleId,
      );
      const updatePromise = guildService.updateRole(
        guild._id.toString(),
        roleId,
        ownerId,
        { name: 'Should Not Update' },
      );

      const results = await Promise.allSettled([deletePromise, updatePromise]);

      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      console.log(
        `Concurrency: ${successful.length} success, ${failed.length} failed`,
      );

      const finalGuild = await guildModel.findById(guild._id);
      const roleExists = finalGuild.roles.some(
        (r) => r._id.toString() === roleId,
      );

      // Role must be gone
      expect(roleExists).toBeFalsy();

      // Check Member side effect
      const finalMember = await memberModel.findById(member._id);
      const memberHasRole = finalMember.roles.some(
        (r) => r.toString() === roleId,
      );

      // Role should be removed from member regardless of race outcome
      expect(memberHasRole).toBeFalsy();

      if (failed.length > 0) {
        // If Update failed, it should be because Role Not Found
        const failure = failed[0] as PromiseRejectedResult;
        expect(failure.reason.message).toMatch(/Role not found|VersionError/);
      }
    });
  });
});
