import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { MemberService } from './member.service';
import { Member, memberSchema, MemberDocument } from './schemas/member.schema';
import {
  Guild,
  guildSchema,
  GuildDocument,
} from '../guild/schemas/guild.schema';
import {
  Channel,
  channelSchema,
  ChannelDocument,
} from '../channel/schemas/channel.schema';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  BaseFixturesHelper,
  GuildFixturesHelper,
  MemberFixturesHelper,
  ChannelFixturesHelper,
} from '../../test/helpers/fixtures';
import {
  PERMISSIONS,
  PERMISSIONOVERWRITE,
  CHANNEL,
} from '@discord-platform/shared';
import { NotFoundException } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('MemberService', () => {
  let module: TestingModule;
  let memberService: MemberService;
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
        MemberService,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    memberService = module.get<MemberService>(MemberService);
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

  describe('addMemberToGuild', () => {
    it('should add a new member to a guild successfully', async () => {
      // Arrange
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Act
      const member = await memberService.addMemberToGuild(
        guild._id.toString(),
        userId.toString(),
        'TestNickname',
      );

      // Assert
      expect(member).toBeDefined();
      expect(member.guild.toString()).toBe(guild._id.toString());
      expect(member.user.toString()).toBe(userId.toString());
      expect(member.nickName).toBe('TestNickname');
      expect(member.roles).toEqual([]);
    });

    it('should add a member without nickname', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const member = await memberService.addMemberToGuild(
        guild._id.toString(),
        userId.toString(),
      );

      expect(member).toBeDefined();
      expect(member.nickName).toBeUndefined();
    });

    it('should return existing member if already in guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Add member first time
      const member1 = await memberService.addMemberToGuild(
        guild._id.toString(),
        userId.toString(),
        'FirstNickname',
      );

      // Try to add same member again with different nickname
      const member2 = await memberService.addMemberToGuild(
        guild._id.toString(),
        userId.toString(),
        'SecondNickname',
      );

      // Should return existing member, not create new one
      expect(member2._id.toString()).toBe(member1._id.toString());
      expect(member2.nickName).toBe('FirstNickname'); // Original nickname preserved
    });

    it('should throw NotFoundException when guild does not exist', async () => {
      const userId = BaseFixturesHelper.generateObjectId();
      const nonExistentGuildId = BaseFixturesHelper.generateObjectId();

      await expect(
        memberService.addMemberToGuild(
          nonExistentGuildId.toString(),
          userId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMemberFromGuild', () => {
    it('should remove a member from a guild successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Add member first
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      // Verify member exists
      const memberBefore = await memberModel.findOne({
        guild: guild._id,
        user: userId,
      });
      expect(memberBefore).not.toBeNull();

      // Act
      await memberService.removeMemberFromGuild(
        guild._id.toString(),
        userId.toString(),
      );

      // Assert
      const memberAfter = await memberModel.findOne({
        guild: guild._id,
        user: userId,
      });
      expect(memberAfter).toBeNull();
    });

    it('should not throw error when removing non-existent member', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Should not throw
      await expect(
        memberService.removeMemberFromGuild(
          guild._id.toString(),
          userId.toString(),
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('getUserMembers', () => {
    it('should return all members for a user in a specific guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
        nickName: 'TestUser',
      });

      const members = await memberService.getUserMembers(
        guild._id.toString(),
        userId.toString(),
      );

      expect(members).toHaveLength(1);
      expect(members[0].user.toString()).toBe(userId.toString());
      expect(members[0].nickName).toBe('TestUser');
    });

    it('should return empty array when user is not in guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const members = await memberService.getUserMembers(
        guild._id.toString(),
        userId.toString(),
      );

      expect(members).toEqual([]);
    });
  });

  describe('getGuildMembers', () => {
    it('should return all members in a guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Create multiple members
      const userId1 = BaseFixturesHelper.generateObjectId();
      const userId2 = BaseFixturesHelper.generateObjectId();
      const userId3 = BaseFixturesHelper.generateObjectId();

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: userId1,
        nickName: 'User1',
      });
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: userId2,
        nickName: 'User2',
      });
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: userId3,
        nickName: 'User3',
      });

      const members = await memberService.getGuildMembers(guild._id.toString());

      expect(members).toHaveLength(3);
    });

    it('should return empty array when guild has no members', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const members = await memberService.getGuildMembers(guild._id.toString());

      expect(members).toEqual([]);
    });

    it('should not return members from other guilds', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild1 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 1',
      });
      const guild2 = await guildFixtures.createTestGuild({
        ownerId,
        name: 'Guild 2',
      });

      const userId1 = BaseFixturesHelper.generateObjectId();
      const userId2 = BaseFixturesHelper.generateObjectId();

      await memberFixtures.createTestMember({
        guildId: guild1._id,
        userId: userId1,
      });
      await memberFixtures.createTestMember({
        guildId: guild2._id,
        userId: userId2,
      });

      const members = await memberService.getGuildMembers(
        guild1._id.toString(),
      );

      expect(members).toHaveLength(1);
      expect(members[0].user.toString()).toBe(userId1.toString());
    });
  });

  describe('updateMemberNickname', () => {
    it('should update member nickname successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
        nickName: 'OldNickname',
      });

      const updatedMember = await memberService.updateMemberNickname(
        guild._id.toString(),
        userId.toString(),
        'NewNickname',
      );

      expect(updatedMember.nickName).toBe('NewNickname');
    });

    it('should throw NotFoundException when guild does not exist', async () => {
      const userId = BaseFixturesHelper.generateObjectId();
      const nonExistentGuildId = BaseFixturesHelper.generateObjectId();

      await expect(
        memberService.updateMemberNickname(
          nonExistentGuildId.toString(),
          userId.toString(),
          'NewNickname',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when member does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonExistentUserId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await expect(
        memberService.updateMemberNickname(
          guild._id.toString(),
          nonExistentUserId.toString(),
          'NewNickname',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addRoleToMember', () => {
    it('should add a role to member successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();

      // Create guild with custom role
      const guild = await guildFixtures.createTestGuild({
        ownerId,
        roles: [
          {
            name: '@everyone',
            permissions: PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
          },
          {
            name: 'Admin',
            permissions: PERMISSIONS.ADMINISTRATOR,
          },
        ],
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      // Find Admin role
      const adminRole = guild.roles.find((r) => r.name === 'Admin');
      expect(adminRole).toBeDefined();

      const updatedMember = await memberService.addRoleToMember(
        guild._id.toString(),
        userId.toString(),
        adminRole?._id.toString(),
      );

      expect(updatedMember.roles).toHaveLength(1);
      expect(updatedMember.roles[0].toString()).toBe(adminRole?._id.toString());
    });

    it('should not add duplicate role', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();

      const guild = await guildFixtures.createTestGuild({
        ownerId,
        roles: [
          {
            name: '@everyone',
            permissions: PERMISSIONS.VIEW_CHANNELS,
          },
          {
            name: 'Moderator',
            permissions: PERMISSIONS.KICK_MEMBERS,
          },
        ],
      });

      const modRole = guild.roles.find((r) => r.name === 'Moderator');

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
        roles: [modRole?._id],
      });

      // Try to add the same role again
      const updatedMember = await memberService.addRoleToMember(
        guild._id.toString(),
        userId.toString(),
        modRole?._id.toString(),
      );

      // Should still have only 1 role
      expect(updatedMember.roles).toHaveLength(1);
    });

    it('should throw NotFoundException when guild does not exist', async () => {
      const userId = BaseFixturesHelper.generateObjectId();
      const roleId = BaseFixturesHelper.generateObjectId();
      const nonExistentGuildId = BaseFixturesHelper.generateObjectId();

      await expect(
        memberService.addRoleToMember(
          nonExistentGuildId.toString(),
          userId.toString(),
          roleId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when role does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const nonExistentRoleId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      await expect(
        memberService.addRoleToMember(
          guild._id.toString(),
          userId.toString(),
          nonExistentRoleId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when member does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonExistentUserId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const everyoneRole = guild.roles[0];

      await expect(
        memberService.addRoleToMember(
          guild._id.toString(),
          nonExistentUserId.toString(),
          everyoneRole._id.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate user permission cache after adding role', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();

      const guild = await guildFixtures.createTestGuild({
        ownerId,
        roles: [
          {
            name: '@everyone',
            permissions: PERMISSIONS.VIEW_CHANNELS,
          },
          {
            name: 'Admin',
            permissions: PERMISSIONS.ADMINISTRATOR,
          },
        ],
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      // Get permissions first (should cache)
      const permsBefore = await memberService.getMemberPermissions(
        guild._id.toString(),
        userId.toString(),
      );
      expect(permsBefore).toBe(PERMISSIONS.VIEW_CHANNELS);

      // Add admin role
      const adminRole = guild.roles.find((r) => r.name === 'Admin');
      await memberService.addRoleToMember(
        guild._id.toString(),
        userId.toString(),
        adminRole?._id.toString(),
      );

      // Get permissions again (cache should be invalidated)
      const permsAfter = await memberService.getMemberPermissions(
        guild._id.toString(),
        userId.toString(),
      );
      expect(permsAfter).toBe(
        PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.ADMINISTRATOR,
      );
    });
  });

  describe('removeRoleFromMember', () => {
    it('should remove a role from member successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();

      const guild = await guildFixtures.createTestGuild({
        ownerId,
        roles: [
          {
            name: '@everyone',
            permissions: PERMISSIONS.VIEW_CHANNELS,
          },
          {
            name: 'Moderator',
            permissions: PERMISSIONS.KICK_MEMBERS,
          },
        ],
      });

      const modRole = guild.roles.find((r) => r.name === 'Moderator');

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
        roles: [modRole?._id],
      });

      const updatedMember = await memberService.removeRoleFromMember(
        guild._id.toString(),
        userId.toString(),
        modRole?._id.toString(),
      );

      expect(updatedMember.roles).toHaveLength(0);
    });

    it('should throw NotFoundException when member does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonExistentUserId = BaseFixturesHelper.generateObjectId();
      const roleId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await expect(
        memberService.removeRoleFromMember(
          guild._id.toString(),
          nonExistentUserId.toString(),
          roleId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate user permission cache after removing role', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();

      const guild = await guildFixtures.createTestGuild({
        ownerId,
        roles: [
          {
            name: '@everyone',
            permissions: PERMISSIONS.VIEW_CHANNELS,
          },
          {
            name: 'Admin',
            permissions: PERMISSIONS.ADMINISTRATOR,
          },
        ],
      });

      const adminRole = guild.roles.find((r) => r.name === 'Admin');

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
        roles: [adminRole?._id],
      });

      // Get permissions first (should cache)
      const permsBefore = await memberService.getMemberPermissions(
        guild._id.toString(),
        userId.toString(),
      );
      expect(permsBefore).toBe(
        PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.ADMINISTRATOR,
      );

      // Remove admin role
      await memberService.removeRoleFromMember(
        guild._id.toString(),
        userId.toString(),
        adminRole?._id.toString(),
      );

      // Get permissions again (cache should be invalidated)
      const permsAfter = await memberService.getMemberPermissions(
        guild._id.toString(),
        userId.toString(),
      );
      expect(permsAfter).toBe(PERMISSIONS.VIEW_CHANNELS);
    });
  });

  describe('getMemberPermissions', () => {
    describe('guild-level permissions', () => {
      it('should return ADMINISTRATOR permission for guild owner', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const guild = await guildFixtures.createTestGuild({ ownerId });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          ownerId.toString(),
        );

        expect(permissions).toBe(PERMISSIONS.ADMINISTRATOR);
      });

      it('should return @everyone permissions for member without additional roles', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();
        const guild = await guildFixtures.createTestGuild({ ownerId });

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
        });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
        );

        // Default @everyone has VIEW_CHANNELS
        expect(permissions & PERMISSIONS.VIEW_CHANNELS).toBeTruthy();
      });

      it('should combine permissions from multiple roles', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions: PERMISSIONS.VIEW_CHANNELS,
            },
            {
              name: 'Role1',
              permissions: PERMISSIONS.SEND_MESSAGES,
            },
            {
              name: 'Role2',
              permissions: PERMISSIONS.EMBED_LINKS,
            },
          ],
        });

        const role1 = guild.roles.find((r) => r.name === 'Role1');
        const role2 = guild.roles.find((r) => r.name === 'Role2');

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
          roles: [role1?._id, role2?._id],
        });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
        );

        // Should have all permissions combined
        expect(permissions).toBe(
          PERMISSIONS.VIEW_CHANNELS |
            PERMISSIONS.SEND_MESSAGES |
            PERMISSIONS.EMBED_LINKS,
        );
      });

      it('should return 0 for non-member', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const nonMemberId = BaseFixturesHelper.generateObjectId();
        const guild = await guildFixtures.createTestGuild({ ownerId });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          nonMemberId.toString(),
        );

        expect(permissions).toBe(0);
      });

      it('should throw NotFoundException when guild does not exist', async () => {
        const userId = BaseFixturesHelper.generateObjectId();
        const nonExistentGuildId = BaseFixturesHelper.generateObjectId();

        await expect(
          memberService.getMemberPermissions(
            nonExistentGuildId.toString(),
            userId.toString(),
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('channel-level permissions', () => {
      it('should apply role permission overwrites to channel', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions:
                PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
            },
          ],
        });

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
        });

        const everyoneRole = guild.roles[0];

        // Create channel with permission overwrite denying SEND_MESSAGES for @everyone
        const channel = await channelFixtures.createTestChannel({
          name: 'restricted-channel',
          guildId: guild._id,
          permissionOverwrites: [
            {
              id: everyoneRole._id.toString(),
              type: PERMISSIONOVERWRITE.ROLE,
              allow: 0,
              deny: PERMISSIONS.SEND_MESSAGES,
            },
          ],
        });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
          channel._id.toString(),
        );

        // Should have VIEW_CHANNELS but not SEND_MESSAGES
        expect(permissions & PERMISSIONS.VIEW_CHANNELS).toBeTruthy();
        expect(permissions & PERMISSIONS.SEND_MESSAGES).toBeFalsy();
      });

      it('should apply member permission overwrites to channel', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions: PERMISSIONS.VIEW_CHANNELS,
            },
          ],
        });

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
        });

        // Create channel with member-specific permission overwrite
        const channel = await channelFixtures.createTestChannel({
          name: 'special-channel',
          guildId: guild._id,
          permissionOverwrites: [
            {
              id: userId.toString(),
              type: PERMISSIONOVERWRITE.MEMBER,
              allow: PERMISSIONS.SEND_MESSAGES | PERMISSIONS.EMBED_LINKS,
              deny: 0,
            },
          ],
        });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
          channel._id.toString(),
        );

        // Should have the member-specific permissions added
        expect(permissions & PERMISSIONS.VIEW_CHANNELS).toBeTruthy();
        expect(permissions & PERMISSIONS.SEND_MESSAGES).toBeTruthy();
        expect(permissions & PERMISSIONS.EMBED_LINKS).toBeTruthy();
      });

      it('should prioritize member overwrites over role overwrites', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions:
                PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
            },
          ],
        });

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
        });

        const everyoneRole = guild.roles[0];

        // Role denies SEND_MESSAGES, but member allows it
        const channel = await channelFixtures.createTestChannel({
          name: 'mixed-perms-channel',
          guildId: guild._id,
          permissionOverwrites: [
            {
              id: everyoneRole._id.toString(),
              type: PERMISSIONOVERWRITE.ROLE,
              allow: 0,
              deny: PERMISSIONS.SEND_MESSAGES,
            },
            {
              id: userId.toString(),
              type: PERMISSIONOVERWRITE.MEMBER,
              allow: PERMISSIONS.SEND_MESSAGES,
              deny: 0,
            },
          ],
        });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
          channel._id.toString(),
        );

        // Member overwrite should override role deny
        expect(permissions & PERMISSIONS.SEND_MESSAGES).toBeTruthy();
      });

      it('should return guild-level permissions when channel does not exist', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions:
                PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
            },
          ],
        });

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
        });

        const nonExistentChannelId = BaseFixturesHelper.generateObjectId();

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
          nonExistentChannelId.toString(),
        );

        // Should return guild-level permissions
        expect(permissions).toBe(
          PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
        );
      });

      it('should bypass all channel overwrites for ADMINISTRATOR', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions: PERMISSIONS.VIEW_CHANNELS,
            },
            {
              name: 'Admin',
              permissions: PERMISSIONS.ADMINISTRATOR,
            },
          ],
        });

        const adminRole = guild.roles.find((r) => r.name === 'Admin');
        const everyoneRole = guild.roles.find((r) => r.name === '@everyone');

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
          roles: [adminRole?._id],
        });

        // Create channel that denies VIEW_CHANNELS for @everyone
        const channel = await channelFixtures.createTestChannel({
          name: 'admin-only',
          guildId: guild._id,
          permissionOverwrites: [
            {
              id: everyoneRole?._id.toString(),
              type: PERMISSIONOVERWRITE.ROLE,
              allow: 0,
              deny: PERMISSIONS.VIEW_CHANNELS,
            },
          ],
        });

        const permissions = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
          channel._id.toString(),
        );

        // Admin should bypass the deny
        expect(permissions & PERMISSIONS.ADMINISTRATOR).toBeTruthy();
      });
    });

    describe('permission caching', () => {
      it('should cache permissions and return from cache on second call', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions: PERMISSIONS.VIEW_CHANNELS,
            },
          ],
        });

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
        });

        // First call - should calculate and cache
        const perms1 = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
        );

        // Second call - should return from cache
        const perms2 = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
        );

        expect(perms1).toBe(perms2);
        expect(perms1).toBe(PERMISSIONS.VIEW_CHANNELS);
      });

      it('should use different cache keys for guild vs channel permissions', async () => {
        const ownerId = BaseFixturesHelper.generateObjectId();
        const userId = BaseFixturesHelper.generateObjectId();

        const guild = await guildFixtures.createTestGuild({
          ownerId,
          roles: [
            {
              name: '@everyone',
              permissions:
                PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
            },
          ],
        });

        await memberFixtures.createTestMember({
          guildId: guild._id,
          userId,
        });

        const everyoneRole = guild.roles[0];

        const channel = await channelFixtures.createTestChannel({
          name: 'test-channel',
          guildId: guild._id,
          permissionOverwrites: [
            {
              id: everyoneRole._id.toString(),
              type: PERMISSIONOVERWRITE.ROLE,
              allow: 0,
              deny: PERMISSIONS.SEND_MESSAGES,
            },
          ],
        });

        // Get guild-level permissions
        const guildPerms = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
        );

        // Get channel-level permissions
        const channelPerms = await memberService.getMemberPermissions(
          guild._id.toString(),
          userId.toString(),
          channel._id.toString(),
        );

        // They should be different
        expect(guildPerms).toBe(
          PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES,
        );
        expect(channelPerms).toBe(PERMISSIONS.VIEW_CHANNELS);
      });
    });
  });

  describe('invalidateGuildPermissions', () => {
    it('should invalidate all cached permissions for a guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();

      const guild = await guildFixtures.createTestGuild({
        ownerId,
        roles: [
          {
            name: '@everyone',
            permissions: PERMISSIONS.VIEW_CHANNELS,
          },
        ],
      });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      // Get permissions to cache them
      await memberService.getMemberPermissions(
        guild._id.toString(),
        userId.toString(),
      );

      // Invalidate guild permissions
      await memberService.invalidateGuildPermissions(guild._id.toString());

      // The next call should fetch fresh data
      // (We can't easily verify cache miss, but we can verify it still works)
      const permsAfter = await memberService.getMemberPermissions(
        guild._id.toString(),
        userId.toString(),
      );

      expect(permsAfter).toBe(PERMISSIONS.VIEW_CHANNELS);
    });
  });

  describe('isMemberInGuild', () => {
    it('should return true when user is a member of the guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const userId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId,
      });

      const isMember = await memberService.isMemberInGuild(
        guild._id.toString(),
        userId.toString(),
      );

      expect(isMember).toBe(true);
    });

    it('should return false when user is not a member of the guild', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonMemberId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      const isMember = await memberService.isMemberInGuild(
        guild._id.toString(),
        nonMemberId.toString(),
      );

      expect(isMember).toBe(false);
    });

    it('should return false for non-existent guild', async () => {
      const userId = BaseFixturesHelper.generateObjectId();
      const nonExistentGuildId = BaseFixturesHelper.generateObjectId();

      const isMember = await memberService.isMemberInGuild(
        nonExistentGuildId.toString(),
        userId.toString(),
      );

      expect(isMember).toBe(false);
    });
  });
});
