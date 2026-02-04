import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/configs/redis/redis.module', () => ({
  REDIS_CLIENT: 'REDIS_CLIENT',
}));

import { MongooseModule, getModelToken } from '@nestjs/mongoose';
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
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CreateRoleDTO,
  UpdateRoleDTO,
  CHANNEL_NAME,
  CHANNEL,
} from '@discord-platform/shared';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Model, Types } from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('GuildService', () => {
  let module: TestingModule;
  let guildService: GuildService;
  let guildModel: Model<GuildDocument>;
  let memberModel: Model<MemberDocument>;
  let channelModel: Model<ChannelDocument>;
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
    guildModel = module.get<Model<GuildDocument>>(getModelToken(Guild.name));
    memberModel = module.get<Model<MemberDocument>>(getModelToken(Member.name));
    channelModel = module.get<Model<ChannelDocument>>(
      getModelToken(Channel.name),
    );
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

  describe('createGuild', () => {
    it('should create a guild with default channels and owner member', async () => {
      const name = 'Test Guild';
      const ownerId = new Types.ObjectId().toString();

      const guild = await guildService.createGuild(name, ownerId);

      expect(guild).toBeDefined();
      expect(guild.name).toBe(name);
      expect(guild.owner.toString()).toBe(ownerId);
      expect(guild.systemChannelId).toBeDefined();

      // Verify system channel exists
      const channel = await channelModel.findById(guild.systemChannelId);
      expect(channel).toBeDefined();
      expect(channel.name).toBe(CHANNEL_NAME.GENERAL);
      expect(channel.type).toBe(CHANNEL.GUILD_TEXT);

      // Verify owner is a member
      const member = await memberModel.findOne({
        guild: guild._id,
        user: new Types.ObjectId(ownerId),
      });
      expect(member).toBeDefined();
    });
  });

  describe('getGuildById', () => {
    it('should return the guild if found', async () => {
      const ownerId = new Types.ObjectId().toString();
      const created = await guildService.createGuild('Find Me', ownerId);

      const found = await guildService.getGuildById(created._id.toString());
      expect(found._id.toString()).toBe(created._id.toString());
    });

    it('should throw NotFoundException if guild does not exist', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(guildService.getGuildById(fakeId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createRole', () => {
    it('should create a role with correct position', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Role Guild', ownerId);

      const roleData: CreateRoleDTO = {
        name: 'New Role',
        color: '#FFFFFF',
      };

      const updatedGuild = await guildService.createRole(
        guild._id.toString(),
        roleData,
      );
      const newRole = updatedGuild.roles.find((r) => r.name === 'New Role');

      expect(newRole).toBeDefined();
      expect(newRole.position).toBe(1); // @everyone is 0
    });

    it('should maintain correct position order after multiple sequential insertions', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Sequential Guild', ownerId);

      await guildService.createRole(guild._id.toString(), { name: 'Role 1' });
      await guildService.createRole(guild._id.toString(), { name: 'Role 2' });
      await guildService.createRole(guild._id.toString(), { name: 'Role 3' });

      const updatedGuild = await guildModel.findById(guild._id);
      const r1 = updatedGuild.roles.find((r) => r.name === 'Role 1');
      const r2 = updatedGuild.roles.find((r) => r.name === 'Role 2');
      const r3 = updatedGuild.roles.find((r) => r.name === 'Role 3');
      const everyone = updatedGuild.roles.find((r) => r.name === '@everyone');

      expect(everyone.position).toBe(0);
      expect(r3.position).toBe(1);
      expect(r2.position).toBe(2);
      expect(r1.position).toBe(3);
    });

    it('should throw NotFoundException if guild not found', async () => {
      await expect(
        guildService.createRole(new Types.ObjectId().toString(), {
          name: 'Role',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRole', () => {
    it('should update role details', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Update Guild', ownerId);

      const roleData: CreateRoleDTO = { name: 'To Update' };
      const withRole = await guildService.createRole(
        guild._id.toString(),
        roleData,
      );
      const roleId = withRole.roles
        .find((r) => r.name === 'To Update')
        ._id.toString();

      const updateData: UpdateRoleDTO = {
        name: 'Updated Name',
        color: '#000000',
      };
      const updated = await guildService.updateRole(
        guild._id.toString(),
        roleId,
        ownerId,
        updateData,
      );

      const role = updated.roles.id(roleId);
      expect(role.name).toBe('Updated Name');
      expect(role.color).toBe('#000000');
    });

    it('should throw BadRequestException if trying to rename @everyone', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Everyone Guild', ownerId);
      const everyoneRole = guild.roles.find((r) => r.name === '@everyone');

      await expect(
        guildService.updateRole(
          guild._id.toString(),
          everyoneRole._id.toString(),
          ownerId,
          { name: 'New Everyone' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should shift existing roles up when creating new role, and respect hierarchy', async () => {
      const ownerId = new Types.ObjectId().toString();
      const operatorId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Perm Guild', ownerId);

      // 1. Create 'First Role' (will act as High Role later)
      await guildService.createRole(guild._id.toString(), {
        name: 'First Role',
      });
      // At this point: @everyone(0), First Role(1)

      // 2. Create 'Second Role' (will act as Low Role)
      await guildService.createRole(guild._id.toString(), {
        name: 'Second Role',
      });

      const updatedGuild = await guildModel.findById(guild._id);
      const firstRole = updatedGuild.roles.find((r) => r.name === 'First Role');
      const secondRole = updatedGuild.roles.find(
        (r) => r.name === 'Second Role',
      );

      expect(firstRole.position).toBe(2);
      expect(secondRole.position).toBe(1);

      // 3. Verify Operator with "Second Role" (Low) CANNOT edit "First Role" (High)

      // Add operator as member
      await module
        .get(MemberService)
        .addMemberToGuild(guild._id.toString(), operatorId);

      // Assign 'Second Role' (Pos 1) to Operator
      await module
        .get(MemberService)
        .addRoleToMember(
          guild._id.toString(),
          operatorId,
          secondRole._id.toString(),
        );

      // Try to update 'First Role' (Pos 2) -> Should Fail
      await expect(
        guildService.updateRole(
          guild._id.toString(),
          firstRole._id.toString(),
          operatorId,
          { name: 'Hacked' },
        ),
      ).rejects.toThrow(BadRequestException);

      // 4. Verify Operator with "First Role" (High) CAN edit "Second Role" (Low)

      // Assign 'First Role' (Pos 2) to Operator (Operator now has both, max pos is 2)
      await module
        .get(MemberService)
        .addRoleToMember(
          guild._id.toString(),
          operatorId,
          firstRole._id.toString(),
        );

      // Try to update 'Second Role' (Pos 1) -> Should Pass
      const result = await guildService.updateRole(
        guild._id.toString(),
        secondRole._id.toString(),
        operatorId,
        { name: 'Managed' },
      );

      const updatedSecondRole = result.roles.find((r) =>
        r._id.equals(secondRole._id),
      );
      expect(updatedSecondRole.name).toBe('Managed');
    });
  });

  describe('deleteRole', () => {
    it('should delete a role and remove it from members', async () => {
      const ownerId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Delete Guild', ownerId);

      await guildService.createRole(guild._id.toString(), {
        name: 'To Delete',
      });
      const roleToDelete = (await guildModel.findById(guild._id)).roles.find(
        (r) => r.name === 'To Delete',
      );

      // Add member and assign role
      await module
        .get(MemberService)
        .addMemberToGuild(guild._id.toString(), userId);
      await module
        .get(MemberService)
        .addRoleToMember(
          guild._id.toString(),
          userId,
          roleToDelete._id.toString(),
        );

      // Delete Role
      await guildService.deleteRole(
        guild._id.toString(),
        roleToDelete._id.toString(),
      );

      const updatedGuild = await guildModel.findById(guild._id);
      expect(updatedGuild.roles.id(roleToDelete._id)).toBeNull();

      const member = await memberModel.findOne({
        guild: guild._id,
        user: new Types.ObjectId(userId),
      });
      expect(member).toBeDefined();
      expect(member.roles).not.toContainEqual(roleToDelete._id);
    });

    it('should throw BadRequestException if deleting @everyone', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Delete Everyone', ownerId);
      const everyoneRole = guild.roles.find((r) => r.name === '@everyone');

      await expect(
        guildService.deleteRole(
          guild._id.toString(),
          everyoneRole._id.toString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMemberHigestRolePosition', () => {
    it('should return MAX_SAFE_INTEGER for owner', async () => {
      const ownerId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Owner Position', ownerId);

      const pos = await guildService.getMemberHigestRolePosition(
        guild._id.toString(),
        ownerId,
      );
      expect(pos).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should return highest role position for member', async () => {
      const ownerId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const guild = await guildService.createGuild('Member Position', ownerId);

      await guildService.createRole(guild._id.toString(), { name: 'Role 1' }); // pos 1
      await guildService.createRole(guild._id.toString(), { name: 'Role 2' }); // pos 2

      const updatedGuild = await guildModel.findById(guild._id);
      const role2 = updatedGuild.roles.find((r) => r.name === 'Role 2');

      await module
        .get(MemberService)
        .addMemberToGuild(guild._id.toString(), userId);
      await module
        .get(MemberService)
        .addRoleToMember(guild._id.toString(), userId, role2._id.toString());

      const pos = await guildService.getMemberHigestRolePosition(
        guild._id.toString(),
        userId,
      );
      expect(pos).toBe(role2.position);
    });
  });
});
