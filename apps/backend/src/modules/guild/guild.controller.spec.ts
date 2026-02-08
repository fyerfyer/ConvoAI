import { Test, TestingModule } from '@nestjs/testing';
import { GuildController } from './guild.controller';
import { GuildService } from './guild.service';
import { ChannelService } from '../channel/channel.service';
import { MemberService } from '../member/member.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Guild, GuildDocument, guildSchema } from './schemas/guild.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { Member, memberSchema } from '../member/schemas/member.schema';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { Model } from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('GuildController', () => {
  let module: TestingModule;
  let controller: GuildController;

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
          { name: Channel.name, schema: channelSchema },
          { name: Member.name, schema: memberSchema },
        ]),
      ],
      controllers: [GuildController],
      providers: [
        GuildService,
        ChannelService,
        MemberService,
        JwtService,
        Reflector,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    controller = module.get<GuildController>(GuildController);
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
