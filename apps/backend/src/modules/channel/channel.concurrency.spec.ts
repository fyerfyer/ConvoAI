import { Test, TestingModule } from '@nestjs/testing';
jest.mock('../../common/configs/redis/redis.module', () => ({
  REDIS_CLIENT: 'REDIS_CLIENT',
}));

import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { ChannelService } from './channel.service';
import {
  Channel,
  channelSchema,
  ChannelDocument,
} from './schemas/channel.schema';
import {
  Guild,
  guildSchema,
  GuildDocument,
} from '../guild/schemas/guild.schema';
import { Member, memberSchema } from '../member/schemas/member.schema';
import { MemberService } from '../member/member.service';
import { GuildService } from '../guild/guild.service';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
// Use relative paths to access fixtures based on directory structure found
import { ChannelFixturesHelper } from '../../test/helpers/fixtures/channel/channel-fixtures.helper';
import { GuildFixturesHelper } from '../../test/helpers/fixtures/guild/guild-fixtures.helper';
import { PERMISSIONOVERWRITE, PERMISSIONS } from '@discord-platform/shared';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('ChannelService Concurrency', () => {
  let module: TestingModule;
  let channelService: ChannelService;
  let guildModel: Model<GuildDocument>;
  let channelModel: Model<ChannelDocument>;
  let guildFixtures: GuildFixturesHelper;
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
      providers: [
        ChannelService,
        MemberService,
        GuildService,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    channelService = module.get<ChannelService>(ChannelService);
    guildModel = module.get<Model<GuildDocument>>(getModelToken(Guild.name));
    channelModel = module.get<Model<ChannelDocument>>(
      getModelToken(Channel.name),
    );

    guildFixtures = new GuildFixturesHelper(guildModel);
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
    jest.restoreAllMocks();
  });

  describe('Concurrent updateChannel', () => {
    it('should handle concurrent updates to the same channel without lost updates', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
        name: 'base-channel',
      });

      const concurrencyCount = 10;
      const updatePromises = [];

      for (let i = 0; i < concurrencyCount; i++) {
        updatePromises.push(
          channelService.updateChannel(channel._id.toString(), ownerId, {
            name: `Updated Name ${i}`,
          }),
        );
      }

      const results = await Promise.allSettled(updatePromises);
      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      console.log(
        `UpdateChannel Concurrency: ${successful.length} success, ${failed.length} failed`,
      );

      // Verify failures are version errors if any
      if (failed.length > 0) {
        const firstFailure = failed[0] as PromiseRejectedResult;
        expect(firstFailure.reason.message).toMatch(
          /VersionError|No matching document/,
        );
      } else {
        expect(successful.length).toBe(concurrencyCount);
      }

      // Verify final state matches ONE of the updates (last write wins, or close to it)
      const finalChannel = await channelModel.findById(channel._id);
      expect(finalChannel.name).toMatch(/Updated Name \d+/);
    });
  });

  describe('Concurrent addPermissionOverwrite', () => {
    it('should handle concurrent permission overwrites without losing data', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
        name: 'perm-channel',
      });

      const concurrencyCount = 10;
      const overwritePromises = [];

      // Create distinct users/roles to add overwrites for
      for (let i = 0; i < concurrencyCount; i++) {
        const userId = new Types.ObjectId().toString();
        overwritePromises.push(
          channelService.addPermissionOverwrite(
            channel._id.toString(),
            ownerId,
            {
              id: userId,
              type: PERMISSIONOVERWRITE.MEMBER,
              allow: PERMISSIONS.VIEW_CHANNELS,
              deny: 0,
            },
          ),
        );
      }

      const results = await Promise.allSettled(overwritePromises);
      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      console.log(
        `AddPermissionOverwrite Concurrency: ${successful.length} success, ${failed.length} failed`,
      );

      if (failed.length > 0) {
        const firstFailure = failed[0] as PromiseRejectedResult;
        expect(firstFailure.reason.message).toMatch(
          /VersionError|No matching document/,
        );
      } else {
        expect(successful.length).toBe(concurrencyCount);
      }

      const finalChannel = await channelModel.findById(channel._id);

      // IF all succeeded, we should have 10 overwrites
      // Even if some failed (after retries), we want to verify we have at least 'successful.length' overwrites
      const overwriteCount = finalChannel.permissionOverwrites.length;
      expect(overwriteCount).toBeGreaterThanOrEqual(successful.length);
    });
  });
});
