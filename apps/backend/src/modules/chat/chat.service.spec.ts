import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatService } from './chat.service';
import {
  Message,
  messageSchema,
  MessageDocument,
} from './schemas/message.schema';
import {
  Channel,
  channelSchema,
  ChannelDocument,
} from '../channel/schemas/channel.schema';
import {
  Guild,
  guildSchema,
  GuildDocument,
} from '../guild/schemas/guild.schema';
import { Member, memberSchema } from '../member/schemas/member.schema';
import { User, userSchema, UserDocument } from '../user/schemas/user.schema';
const REDIS_CLIENT = 'REDIS_CLIENT';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  GuildFixturesHelper,
  ChannelFixturesHelper,
  MessageFixturesHelper,
  BaseFixturesHelper,
} from '../../test/helpers/fixtures';
import {
  CreateMessageDTO,
  MESSAGE_EVENT,
  CHANNEL,
} from '@discord-platform/shared';
import { NotFoundException } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('ChatService', () => {
  let module: TestingModule;
  let chatService: ChatService;
  let messageModel: Model<MessageDocument>;
  let channelModel: Model<ChannelDocument>;
  let guildModel: Model<GuildDocument>;
  let userModel: Model<UserDocument>;
  let eventEmitter: EventEmitter2;

  let guildFixtures: GuildFixturesHelper;
  let channelFixtures: ChannelFixturesHelper;
  let messageFixtures: MessageFixturesHelper;

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
          { name: Message.name, schema: messageSchema },
          { name: Channel.name, schema: channelSchema },
          { name: Guild.name, schema: guildSchema },
          { name: Member.name, schema: memberSchema },
          { name: User.name, schema: userSchema },
        ]),
      ],
      providers: [
        ChatService,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    chatService = module.get<ChatService>(ChatService);
    messageModel = module.get<Model<MessageDocument>>(
      getModelToken(Message.name),
    );
    channelModel = module.get<Model<ChannelDocument>>(
      getModelToken(Channel.name),
    );
    guildModel = module.get<Model<GuildDocument>>(getModelToken(Guild.name));
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    guildFixtures = new GuildFixturesHelper(guildModel);
    channelFixtures = new ChannelFixturesHelper(channelModel);
    messageFixtures = new MessageFixturesHelper(messageModel);
  });

  afterAll(async () => {
    await module.close();
    await TestDatabaseHelper.disconnect();
    await TestRedisHelper.disconnect();
  });

  beforeEach(async () => {
    await TestDatabaseHelper.clearDatabase();
    await TestRedisHelper.clearRedis();
    jest.clearAllMocks();
  });

  describe('createMessage', () => {
    it('should create a message successfully', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      await userModel.create({
        _id: ownerId,

        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
        type: CHANNEL.GUILD_TEXT,
      });

      const createMessageDTO: CreateMessageDTO = {
        content: 'Hello world',
        channelId: channel._id.toString(),
      };

      const message = await chatService.createMessage(
        ownerId.toString(),
        createMessageDTO,
      );

      expect(message).toBeDefined();
      expect(message.content).toBe('Hello world');
      expect(message.sender._id.toString()).toBe(ownerId.toString());
      expect(message.channelId.toString()).toBe(channel._id.toString());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        MESSAGE_EVENT.CREATE_MESSAGE,
        expect.anything(),
      );
    });

    it('should throw NotFoundException if channel does not exist', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonExistentChannelId = BaseFixturesHelper.generateObjectId();

      const createMessageDTO: CreateMessageDTO = {
        content: 'Hello world',
        channelId: nonExistentChannelId.toString(),
      };

      await expect(
        chatService.createMessage(ownerId.toString(), createMessageDTO),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create a reply message', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });
      const originalMessage = await messageFixtures.createTestMessage({
        channelId: channel._id,
        content: 'Original message',
        sender: ownerId,
      });

      const createMessageDTO: CreateMessageDTO = {
        content: 'Reply message',
        channelId: channel._id.toString(),
        replyTo: originalMessage._id.toString(),
      };

      const reply = await chatService.createMessage(
        ownerId.toString(),
        createMessageDTO,
      );

      expect(reply.replyTo).toBeDefined();
      expect(reply.replyTo.toString()).toBe(originalMessage._id.toString());
    });
  });

  describe('getMessages', () => {
    it('should return messages for a channel', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      // Create 3 messages
      await messageFixtures.createMultipleMessages(3, {
        channelId: channel._id,
        sender: ownerId,
      });

      const messages = await chatService.getMessages(channel._id.toString());

      expect(messages).toHaveLength(3);
      // Default sort is _id desc (newest first)
      expect(
        messages[0]._id.toString().localeCompare(messages[1]._id.toString()),
      ).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      await messageFixtures.createMultipleMessages(10, {
        channelId: channel._id,
        sender: ownerId,
      });

      const messages = await chatService.getMessages(channel._id.toString(), 5);

      expect(messages).toHaveLength(5);
    });

    it('should return empty array for empty channel', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const messages = await chatService.getMessages(channel._id.toString());

      expect(messages).toEqual([]);
    });

    it('should filter by beforeId', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const msg1 = await messageFixtures.createTestMessage({
        channelId: channel._id,
        sender: ownerId,
        content: '1',
      });
      // Sleep slightly to ensure distinct IDs if generated by time (standard Mongo ObjectId has timestamp)
      const msg2 = await messageFixtures.createTestMessage({
        channelId: channel._id,
        sender: ownerId,
        content: '2',
      });
      const msg3 = await messageFixtures.createTestMessage({
        channelId: channel._id,
        sender: ownerId,
        content: '3',
      });

      // Fetch messages before msg3 (should get msg2, msg1)
      const messages = await chatService.getMessages(
        channel._id.toString(),
        10,
        msg3._id.toString(),
      );

      expect(messages).toHaveLength(2);
      expect(messages.map((m) => m._id.toString())).toContain(
        msg2._id.toString(),
      );
      expect(messages.map((m) => m._id.toString())).toContain(
        msg1._id.toString(),
      );
      expect(messages.map((m) => m._id.toString())).not.toContain(
        msg3._id.toString(),
      );
    });
  });
});
