import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { ChatGateway } from './gateway';
import { GatewaySessionManager } from './gateway.session';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { ChatService } from '../chat/chat.service';
import { ChannelService } from '../channel/channel.service';
import { MemberService } from '../member/member.service';
import {
  Message,
  messageSchema,
  MessageDocument,
} from '../chat/schemas/message.schema';
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
import {
  Member,
  memberSchema,
  MemberDocument,
} from '../member/schemas/member.schema';
import { User, userSchema, UserDocument } from '../user/schemas/user.schema';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  BaseFixturesHelper,
  GuildFixturesHelper,
  MemberFixturesHelper,
  ChannelFixturesHelper,
  MessageFixturesHelper,
  UserFixturesHelper,
} from '../../test/helpers/fixtures';
import {
  JwtPayload,
  SOCKET_EVENT,
  MESSAGE_EVENT,
  CreateMessageDTO,
} from '@discord-platform/shared';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RedisKeys } from '../../common/constants/redis-keys.constant';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

const TEST_PORT = 3333;

describe('ChatGateway (Real Socket.IO)', () => {
  let app: INestApplication;
  let testModule: TestingModule;
  let jwtService: JwtService;
  let eventEmitter: EventEmitter2;

  let guildModel: Model<GuildDocument>;
  let userModel: Model<UserDocument>;
  let memberModel: Model<MemberDocument>;
  let channelModel: Model<ChannelDocument>;
  let messageModel: Model<MessageDocument>;

  let guildFixtures: GuildFixturesHelper;
  let memberFixtures: MemberFixturesHelper;
  let channelFixtures: ChannelFixturesHelper;
  let messageFixtures: MessageFixturesHelper;
  let userFixtures: UserFixturesHelper;

  // Store active client sockets for cleanup
  let activeClients: ClientSocket[] = [];

  const createJwtPayload = (userId: string): JwtPayload => ({
    sub: userId,
    email: `${userId}@test.com`,
    name: `User ${userId}`,
    isBot: false,
  });

  // Create a real Socket.IO client connection
  const createClient = async (
    token?: string,
    options: { useQuery?: boolean } = {},
  ): Promise<ClientSocket> => {
    const clientOptions: Parameters<typeof io>[1] = {
      transports: ['websocket'],
      autoConnect: false,
    };

    if (token) {
      if (options.useQuery) {
        clientOptions.query = { token };
      } else {
        clientOptions.extraHeaders = {
          authorization: `Bearer ${token}`,
        };
      }
    }

    const client = io(`http://localhost:${TEST_PORT}`, clientOptions);
    activeClients.push(client);
    return client;
  };

  // Helper to connect and wait for connection
  const connectClient = (client: ClientSocket): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      client.connect();
    });
  };

  // Helper to wait for disconnect
  const waitForDisconnect = (client: ClientSocket): Promise<void> => {
    return new Promise((resolve) => {
      if (!client.connected) {
        resolve();
        return;
      }
      client.on('disconnect', () => {
        resolve();
      });
      client.disconnect();
    });
  };

  // Helper to emit and receive response when handler returns { event, data } format
  // NestJS will emit the 'data' part on the 'event' name
  const emitWithAck = <T>(
    client: ClientSocket,
    event: string,
    data: unknown,
    timeout = 5000,
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${event}`));
      }, timeout);

      // Listen for the response event (NestJS sends 'data' part on the event name)
      client.once(event, (response: T) => {
        clearTimeout(timer);
        resolve(response);
      });

      // Emit the event
      client.emit(event, data);
    });
  };

  // Helper to emit and receive acknowledgment response
  // When handler returns a non-{ event, data } object, NestJS sends it as acknowledgment
  const emitWithCallback = <T>(
    client: ClientSocket,
    event: string,
    data: unknown,
    timeout = 5000,
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for ack to ${event}`));
      }, timeout);

      client.emit(event, data, (response: T) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  };

  // Helper to wait for an event
  const waitForEvent = <T>(
    client: ClientSocket,
    event: string,
    timeout = 5000,
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event ${event}`));
      }, timeout);

      client.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  };

  beforeAll(async () => {
    await TestDatabaseHelper.connect();
    await TestRedisHelper.connect();

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27020';
    const dbName = process.env.MONGODB_NAME || 'discord-test';

    testModule = await Test.createTestingModule({
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
          { name: Message.name, schema: messageSchema },
          { name: User.name, schema: userSchema },
        ]),
        JwtModule.register({
          secret: process.env.JWT_SECRET || 'test-jwt-secret-key',
          signOptions: { expiresIn: '1h' },
        }),
        EventEmitterModule.forRoot(),
      ],
      providers: [
        ChatGateway,
        GatewaySessionManager,
        WsJwtGuard,
        ChatService,
        ChannelService,
        MemberService,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    app = testModule.createNestApplication();
    await app.listen(TEST_PORT);

    jwtService = testModule.get<JwtService>(JwtService);
    eventEmitter = testModule.get<EventEmitter2>(EventEmitter2);

    guildModel = testModule.get<Model<GuildDocument>>(
      getModelToken(Guild.name),
    );
    memberModel = testModule.get<Model<MemberDocument>>(
      getModelToken(Member.name),
    );
    channelModel = testModule.get<Model<ChannelDocument>>(
      getModelToken(Channel.name),
    );
    messageModel = testModule.get<Model<MessageDocument>>(
      getModelToken(Message.name),
    );
    userModel = testModule.get<Model<UserDocument>>(getModelToken(User.name));

    guildFixtures = new GuildFixturesHelper(guildModel);
    memberFixtures = new MemberFixturesHelper(memberModel);
    channelFixtures = new ChannelFixturesHelper(channelModel);
    messageFixtures = new MessageFixturesHelper(messageModel);
    userFixtures = new UserFixturesHelper(userModel);
  });

  afterAll(async () => {
    // Disconnect all active clients
    await Promise.all(activeClients.map((c) => waitForDisconnect(c)));
    activeClients = [];

    await app.close();
    await TestDatabaseHelper.disconnect();
    await TestRedisHelper.disconnect();
  });

  beforeEach(async () => {
    await TestDatabaseHelper.clearDatabase();
    await TestRedisHelper.clearRedis();
  });

  afterEach(async () => {
    // Clean up clients after each test
    await Promise.all(activeClients.map((c) => waitForDisconnect(c)));
    activeClients = [];
  });

  describe('Connection Handling', () => {
    it('should successfully connect with valid JWT token in header', async () => {
      const userId = BaseFixturesHelper.generateObjectId().toString();
      const token = await jwtService.signAsync(createJwtPayload(userId));

      const client = await createClient(token);
      await connectClient(client);

      expect(client.connected).toBe(true);

      // Verify user socket was stored in Redis
      // Wait a bit for the server to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      const redisClient = TestRedisHelper.getClient();
      const storedSockets = await redisClient.smembers(
        RedisKeys.userSocket(userId),
      );
      expect(storedSockets.length).toBeGreaterThan(0);
    });

    it('should successfully connect with valid JWT token in query parameter', async () => {
      const userId = BaseFixturesHelper.generateObjectId().toString();
      const token = await jwtService.signAsync(createJwtPayload(userId));

      const client = await createClient(token, { useQuery: true });
      await connectClient(client);

      expect(client.connected).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const redisClient = TestRedisHelper.getClient();
      const storedSockets = await redisClient.smembers(`user_socket:${userId}`);
      expect(storedSockets.length).toBeGreaterThan(0);
    });

    it('should disconnect when no token is provided', async () => {
      const client = await createClient();

      const disconnectPromise = new Promise<void>((resolve) => {
        client.on('disconnect', () => resolve());
      });

      client.connect();

      await disconnectPromise;
      expect(client.connected).toBe(false);
    });

    it('should disconnect when invalid token is provided', async () => {
      const client = await createClient('invalid-token');

      const disconnectPromise = new Promise<void>((resolve) => {
        client.on('disconnect', () => resolve());
      });

      client.connect();

      await disconnectPromise;
      expect(client.connected).toBe(false);
    });

    it('should remove user socket from Redis on disconnect', async () => {
      const userId = BaseFixturesHelper.generateObjectId().toString();
      const token = await jwtService.signAsync(createJwtPayload(userId));

      const client = await createClient(token);
      await connectClient(client);

      // Wait for connection to be stored
      await new Promise((resolve) => setTimeout(resolve, 100));

      const redisClient = TestRedisHelper.getClient();
      let storedSockets = await redisClient.smembers(`user_socket:${userId}`);
      expect(storedSockets.length).toBeGreaterThan(0);

      // Disconnect
      await waitForDisconnect(client);

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      storedSockets = await redisClient.smembers(`user_socket:${userId}`);
      expect(storedSockets.length).toBe(0);
    });
  });

  describe('Join/Leave Room', () => {
    it('should allow user with permission to join a room', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: ownerId,
        roles: [guild.roles[0]._id],
      });

      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const token = await jwtService.signAsync(
        createJwtPayload(ownerId.toString()),
      );
      const client = await createClient(token);
      await connectClient(client);

      // NestJS sends the 'data' part of { event, data } on the event name
      const response = await emitWithAck<string>(
        client,
        SOCKET_EVENT.JOIN_ROOM,
        channel._id.toString(),
      );

      expect(response).toBe(channel._id.toString());
    });

    it('should reject user without permission to join a room', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const nonMemberId = BaseFixturesHelper.generateObjectId();

      const guild = await guildFixtures.createTestGuild({ ownerId });
      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const token = await jwtService.signAsync(
        createJwtPayload(nonMemberId.toString()),
      );
      const client = await createClient(token);
      await connectClient(client);

      // Listen for exception event
      const exceptionPromise = waitForEvent<{
        statusCode: number;
        message: string;
      }>(client, 'exception');

      client.emit(SOCKET_EVENT.JOIN_ROOM, channel._id.toString());

      const exception = await exceptionPromise;
      expect(exception.statusCode).toBe(403);
    });

    it('should allow user to leave a room', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: ownerId,
        roles: [guild.roles[0]._id],
      });

      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const token = await jwtService.signAsync(
        createJwtPayload(ownerId.toString()),
      );
      const client = await createClient(token);
      await connectClient(client);

      // First join the room
      await emitWithAck(client, SOCKET_EVENT.JOIN_ROOM, channel._id.toString());

      // Then leave - NestJS sends the 'data' part of { event, data }
      const response = await emitWithAck<string>(
        client,
        SOCKET_EVENT.LEAVE_ROOM,
        channel._id.toString(),
      );

      expect(response).toBe(channel._id.toString());
    });
  });

  describe('Heartbeat', () => {
    it('should respond to heartbeat and refresh TTL', async () => {
      const userId = BaseFixturesHelper.generateObjectId().toString();
      const token = await jwtService.signAsync(createJwtPayload(userId));

      const client = await createClient(token);
      await connectClient(client);

      // Wait for connection to be established
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reduce TTL manually
      const redisClient = TestRedisHelper.getClient();
      await redisClient.expire(RedisKeys.userSocket(userId), 10);

      // Use callback pattern since handleHeartbeat returns plain object
      const response = await emitWithCallback<{ status: string }>(
        client,
        SOCKET_EVENT.HEARTBEAT,
        {},
      );

      expect(response.status).toBe('ok');

      // Verify TTL was refreshed
      const ttl = await redisClient.ttl(`user_socket:${userId}`);
      expect(ttl).toBeGreaterThan(10);
    });
  });

  describe('Messaging', () => {
    it('should create a message and return status', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();

      await userFixtures.createTestUser({
        _id: ownerId,
        name: 'Test Owner',
      });

      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: ownerId,
        roles: [guild.roles[0]._id],
      });

      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const token = await jwtService.signAsync(
        createJwtPayload(ownerId.toString()),
      );
      const client = await createClient(token);
      await connectClient(client);

      const payload: CreateMessageDTO = {
        channelId: channel._id.toString(),
        content: 'Hello from real socket!',
        nonce: 'test-nonce-real',
      };

      // Use callback pattern since handleSendMessage returns plain object
      const response = await emitWithCallback<{
        status: string;
        data: { tempId: string };
      }>(client, SOCKET_EVENT.SEND_MESSAGE, payload);

      expect(response.status).toBe('sent');
      expect(response.data.tempId).toBe('test-nonce-real');

      // Verify message was created in database
      const messages = await messageModel.find({ channelId: channel._id });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello from real socket!');
    });

    it('should broadcast new message to room members', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const memberId = BaseFixturesHelper.generateObjectId();

      // Create users
      await userFixtures.createTestUser({
        _id: ownerId,
        name: 'Owner',
      });
      await userFixtures.createTestUser({
        _id: memberId,
        name: 'Member',
      });

      const guild = await guildFixtures.createTestGuild({ ownerId });

      // Add both as members
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: ownerId,
        roles: [guild.roles[0]._id],
      });
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
        roles: [guild.roles[0]._id],
      });

      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      // Connect both clients
      const ownerToken = await jwtService.signAsync(
        createJwtPayload(ownerId.toString()),
      );
      const memberToken = await jwtService.signAsync(
        createJwtPayload(memberId.toString()),
      );

      const ownerClient = await createClient(ownerToken);
      const memberClient = await createClient(memberToken);

      await connectClient(ownerClient);
      await connectClient(memberClient);

      // Both join the room
      await emitWithAck(
        ownerClient,
        SOCKET_EVENT.JOIN_ROOM,
        channel._id.toString(),
      );
      await emitWithAck(
        memberClient,
        SOCKET_EVENT.JOIN_ROOM,
        channel._id.toString(),
      );

      // Member listens for new message
      const messagePromise = waitForEvent<{ content: string }>(
        memberClient,
        SOCKET_EVENT.NEW_MESSAGE,
      );

      // Owner sends message - use callback pattern
      const payload: CreateMessageDTO = {
        channelId: channel._id.toString(),
        content: 'Broadcast test message',
        nonce: 'broadcast-nonce',
      };

      await emitWithCallback(ownerClient, SOCKET_EVENT.SEND_MESSAGE, payload);

      // Member should receive the broadcast
      const receivedMessage = await messagePromise;
      expect(receivedMessage.content).toBe('Broadcast test message');
    });
  });

  describe('Typing Events', () => {
    it('should broadcast typing event to room members', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();
      const memberId = BaseFixturesHelper.generateObjectId();

      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: ownerId,
        roles: [guild.roles[0]._id],
      });
      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: memberId,
        roles: [guild.roles[0]._id],
      });

      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const ownerToken = await jwtService.signAsync(
        createJwtPayload(ownerId.toString()),
      );
      const memberToken = await jwtService.signAsync(
        createJwtPayload(memberId.toString()),
      );

      const ownerClient = await createClient(ownerToken);
      const memberClient = await createClient(memberToken);

      await connectClient(ownerClient);
      await connectClient(memberClient);

      // Both join the room
      await emitWithAck(
        ownerClient,
        SOCKET_EVENT.JOIN_ROOM,
        channel._id.toString(),
      );
      await emitWithAck(
        memberClient,
        SOCKET_EVENT.JOIN_ROOM,
        channel._id.toString(),
      );

      // Member listens for typing event
      const typingPromise = waitForEvent<{
        userId: string;
        channelId: string;
        isTyping: boolean;
      }>(memberClient, SOCKET_EVENT.TYPING);

      // Owner sends typing event
      ownerClient.emit(SOCKET_EVENT.TYPING, {
        channelId: channel._id.toString(),
        isTyping: true,
      });

      const typingEvent = await typingPromise;
      expect(typingEvent.userId).toBe(ownerId.toString());
      expect(typingEvent.channelId).toBe(channel._id.toString());
      expect(typingEvent.isTyping).toBe(true);
    });
  });

  describe('Multiple Connections', () => {
    it('should handle multiple sockets for the same user', async () => {
      const userId = BaseFixturesHelper.generateObjectId().toString();
      const token = await jwtService.signAsync(createJwtPayload(userId));

      // Connect two clients with the same user
      const client1 = await createClient(token);
      const client2 = await createClient(token);

      await connectClient(client1);
      await connectClient(client2);

      // Wait for connections to be stored
      await new Promise((resolve) => setTimeout(resolve, 100));

      const redisClient = TestRedisHelper.getClient();
      const storedSockets = await redisClient.smembers(`user_socket:${userId}`);
      expect(storedSockets).toHaveLength(2);

      // Disconnect one client
      await waitForDisconnect(client1);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Only one socket should remain
      const remainingSockets = await redisClient.smembers(
        `user_socket:${userId}`,
      );
      expect(remainingSockets).toHaveLength(1);

      // User should still be in global online users
      const onlineUsers = await redisClient.smembers('global_online_users');
      expect(onlineUsers).toContain(userId);
    });
  });

  describe('Event Listener (handleMessageCreated)', () => {
    it('should broadcast message to room when event is emitted', async () => {
      const ownerId = BaseFixturesHelper.generateObjectId();

      // Create user for populate
      await userFixtures.createTestUser({
        _id: ownerId,
        name: 'Test Owner',
      });

      const guild = await guildFixtures.createTestGuild({ ownerId });

      await memberFixtures.createTestMember({
        guildId: guild._id,
        userId: ownerId,
        roles: [guild.roles[0]._id],
      });

      const channel = await channelFixtures.createTestChannel({
        guildId: guild._id,
      });

      const token = await jwtService.signAsync(
        createJwtPayload(ownerId.toString()),
      );
      const client = await createClient(token);
      await connectClient(client);

      // Join the room
      await emitWithAck(client, SOCKET_EVENT.JOIN_ROOM, channel._id.toString());

      // Listen for new message
      const messagePromise = waitForEvent<{ content: string }>(
        client,
        SOCKET_EVENT.NEW_MESSAGE,
      );

      // Manually emit the internal event (simulating what ChatService does)
      const mockMessage = await messageFixtures.createTestMessage({
        sender: ownerId,
        channelId: channel._id,
        content: 'Event emitter test message',
      });

      eventEmitter.emit(MESSAGE_EVENT.CREATE_MESSAGE, mockMessage);

      const receivedMessage = await messagePromise;
      expect(receivedMessage.content).toBe('Event emitter test message');
    });
  });
});
