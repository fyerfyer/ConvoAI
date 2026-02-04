import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GatewaySessionManager } from './gateway.session';
import { REDIS_CLIENT } from '../../common/configs/redis/redis.module';
import { TestRedisHelper } from '../../test/helpers/test-redis.helper';
import {
  CACHE_TTL,
  RedisKeys,
} from '../../common/constants/redis-keys.constant';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('GatewaySessionManager', () => {
  let module: TestingModule;
  let service: GatewaySessionManager;
  let redisClient: Redis;

  beforeAll(async () => {
    await TestRedisHelper.connect();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: path.resolve(__dirname, '../../../.env.test'),
          isGlobal: true,
        }),
      ],
      providers: [
        GatewaySessionManager,
        {
          provide: REDIS_CLIENT,
          useValue: TestRedisHelper.getClient(),
        },
      ],
    }).compile();

    service = module.get<GatewaySessionManager>(GatewaySessionManager);
    redisClient = module.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await module.close();
    await TestRedisHelper.disconnect();
  });

  beforeEach(async () => {
    await TestRedisHelper.clearRedis();
  });

  describe('setUserSocket', () => {
    it('should add user socket and update global online users', async () => {
      const userId = 'user-123';
      const socketId = 'socket-abc';

      await service.setUserSocket(userId, socketId);

      // Verify socket is added to user's socket set
      const userSocketKey = RedisKeys.userSocket(userId);
      const sockets = await redisClient.smembers(userSocketKey);
      expect(sockets).toContain(socketId);
      expect(sockets).toHaveLength(1);

      // Verify TTL is set
      const ttl = await redisClient.ttl(userSocketKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(CACHE_TTL.USER_SOCKET);

      // Verify user is added to global online users
      const globalKey = RedisKeys.globalOnlineUser();
      const onlineUsers = await redisClient.smembers(globalKey);
      expect(onlineUsers).toContain(userId);
    });

    it('should support multiple sockets for the same user', async () => {
      const userId = 'user-123';
      const socketId1 = 'socket-1';
      const socketId2 = 'socket-2';

      await service.setUserSocket(userId, socketId1);
      await service.setUserSocket(userId, socketId2);

      const userSocketKey = RedisKeys.userSocket(userId);
      const sockets = await redisClient.smembers(userSocketKey);
      expect(sockets).toHaveLength(2);
      expect(sockets).toContain(socketId1);
      expect(sockets).toContain(socketId2);
    });
  });

  describe('removeUserSocket', () => {
    it('should remove specific socket id', async () => {
      const userId = 'user-123';
      const socketId1 = 'socket-1';
      const socketId2 = 'socket-2';

      await service.setUserSocket(userId, socketId1);
      await service.setUserSocket(userId, socketId2);

      await service.removeUserSocket(userId, socketId1);

      const userSocketKey = RedisKeys.userSocket(userId);
      const sockets = await redisClient.smembers(userSocketKey);
      expect(sockets).toHaveLength(1);
      expect(sockets).toContain(socketId2);
      expect(sockets).not.toContain(socketId1);

      // User should still be online globally
      const globalKey = RedisKeys.globalOnlineUser();
      const onlineUsers = await redisClient.smembers(globalKey);
      expect(onlineUsers).toContain(userId);
    });

    it('should remove user from global online set when last socket is removed', async () => {
      const userId = 'user-123';
      const socketId = 'socket-1';

      await service.setUserSocket(userId, socketId);
      await service.removeUserSocket(userId, socketId);

      const userSocketKey = RedisKeys.userSocket(userId);
      const sockets = await redisClient.smembers(userSocketKey);
      expect(sockets).toHaveLength(0);

      const globalKey = RedisKeys.globalOnlineUser();
      const onlineUsers = await redisClient.smembers(globalKey);
      expect(onlineUsers).not.toContain(userId);
    });
  });

  describe('refreshUserSocketTTL', () => {
    it('should refresh TTL for existing session', async () => {
      const userId = 'user-123';
      const socketId = 'socket-1';

      await service.setUserSocket(userId, socketId);

      // Manually reduce TTL
      const userSocketKey = RedisKeys.userSocket(userId);
      // We can't easily wait for TTL to expire in unit tests without massive delays or mocked time,
      // but we can check if the method sets it back to approx CACHE_TTL.USER_SOCKET.
      // Let's set it to something small first.
      await redisClient.expire(userSocketKey, 10);

      await service.refreshUserSocketTTL(userId);

      const ttl = await redisClient.ttl(userSocketKey);
      // Expect it to be close to default TTL (e.g., > 10).
      // Assuming CACHE_TTL.USER_SOCKET is significantly larger than 10s.
      // If CACHE_TTL.USER_SOCKET is small, we should check logic.
      // Let's assume standard TTL is > 60s.
      expect(ttl).toBeGreaterThan(10);
      expect(ttl).toBeLessThanOrEqual(CACHE_TTL.USER_SOCKET);
    });

    it('should not ressurect dead session', async () => {
      const userId = 'user-dead';
      await service.refreshUserSocketTTL(userId);

      const exists = await redisClient.exists(RedisKeys.userSocket(userId));
      expect(exists).toBe(0);
    });
  });

  describe('getOnlineUsers', () => {
    it('should return all online users', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      await service.setUserSocket(user1, 'socket-1');
      await service.setUserSocket(user2, 'socket-2');

      const users = await service.getOnlineUsers();
      expect(users).toHaveLength(2);
      expect(users).toContain(user1);
      expect(users).toContain(user2);
    });

    it('should return empty array when no users online', async () => {
      const users = await service.getOnlineUsers();
      expect(users).toEqual([]);
    });
  });
});
