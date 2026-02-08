import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ConfigModule } from '@nestjs/config';
import { UserService } from './user.service';
import { User, userSchema } from './schemas/user.schema';
import { ImageService } from '../media/services/image.service';
import { S3Service } from '../../common/configs/s3/s3.service';
import { AppLogger } from '../../common/configs/logger/logger.service';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import {
  CreateUserDTO,
  UpdateUserDTO,
  BUCKETS,
} from '@discord-platform/shared';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { BadRequestException } from '@nestjs/common';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('UserService', () => {
  let module: TestingModule;
  let userService: UserService;
  let s3Service: S3Service;
  let s3Client: S3Client;
  let connection: Connection;

  beforeAll(async () => {
    // Connect to test infrastructure
    await TestDatabaseHelper.connect();
    await TestRedisHelper.connect();

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27020';
    const dbName = process.env.MONGODB_NAME || 'discord-test';

    // Setup S3 Client for MinIO
    s3Client = new S3Client({
      endpoint: 'http://localhost:9002', // Mapped port
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin123',
      },
      forcePathStyle: true,
    });

    // Create bucket if it doesn't exist (with simple retry)
    for (let i = 0; i < 5; i++) {
      try {
        await s3Client.send(
          new CreateBucketCommand({ Bucket: BUCKETS.PUBLIC }),
        );
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const mockAppLogger = {
      setContext: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      info: jest.fn(),
      exception: jest.fn(),
    };

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: path.resolve(__dirname, '../../../.env.test'),
          isGlobal: true,
        }),
        MongooseModule.forRoot(`${mongoUri}/${dbName}`),
        MongooseModule.forFeature([{ name: User.name, schema: userSchema }]),
      ],
      providers: [
        UserService,
        ImageService,
        S3Service,
        {
          provide: AppLogger,
          useValue: mockAppLogger,
        },
        {
          provide: 'S3_INTERNAL',
          useValue: s3Client,
        },
        {
          provide: 'S3_PUBLIC',
          useValue: s3Client,
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
    s3Service = module.get<S3Service>(S3Service);
    connection = module.get<Connection>(getConnectionToken());
  }, 30000);

  afterAll(async () => {
    await module.close();
    if (s3Client) s3Client.destroy();
    await TestDatabaseHelper.disconnect();
    await TestRedisHelper.disconnect();
  });

  beforeEach(async () => {
    if (connection) {
      const collections = connection.collections;
      for (const key in collections) {
        if (key.startsWith('system.')) continue;
        await collections[key].deleteMany({});
      }
    }
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const createUserDTO: CreateUserDTO = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const user = await userService.createUser(createUserDTO);

      expect(user).toBeDefined();
      expect(user.email).toBe(createUserDTO.email);
      expect(user.name).toBe(createUserDTO.name);
      expect(user.password).not.toBe(createUserDTO.password); // Should be hashed
    });

    it('should throw BadRequestException for duplicate email', async () => {
      const createUserDTO: CreateUserDTO = {
        email: 'duplicate@example.com',
        password: 'password123',
        name: 'First User',
      };

      await userService.createUser(createUserDTO);

      const duplicateUserDTO: CreateUserDTO = {
        ...createUserDTO,
        name: 'Second User',
      };

      await expect(userService.createUser(duplicateUserDTO)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const createUserDTO: CreateUserDTO = {
        email: 'find@example.com',
        password: 'password123',
        name: 'Find User',
      };
      await userService.createUser(createUserDTO);

      const user = await userService.findByEmail('find@example.com');
      expect(user).toBeDefined();
      expect(user?.email).toBe('find@example.com');
    });

    it('should return null if user not found', async () => {
      const user = await userService.findByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });

    it('should include password if requested', async () => {
      const createUserDTO: CreateUserDTO = {
        email: 'password@example.com',
        password: 'password123',
        name: 'Password User',
      };
      await userService.createUser(createUserDTO);

      const user = await userService.findByEmail('password@example.com', true);
      expect(user?.password).toBeDefined();
    });
  });

  describe('updateUser', () => {
    it('should update user details', async () => {
      const user = await userService.createUser({
        email: 'update@example.com',
        password: 'password123',
        name: 'Original Name',
      });

      const updateDTO: UpdateUserDTO = {
        name: 'Updated Name',
        email: 'update@example.com',
      };
      const updatedUser = await userService.updateUser(
        user._id.toString(),
        updateDTO,
      );

      expect(updatedUser.name).toBe('Updated Name');
    });

    it('should throw BadRequestException if updating to existing email', async () => {
      const user1 = await userService.createUser({
        email: 'user1@example.com',
        password: 'password123',
        name: 'User 1',
      });

      await userService.createUser({
        email: 'user2@example.com',
        password: 'password123',
        name: 'User 2',
      });

      await expect(
        userService.updateUser(user1._id.toString(), {
          email: 'user2@example.com',
          name: 'User 1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAvatar', () => {
    it('should update user avatar', async () => {
      const user = await userService.createUser({
        email: 'avatar@example.com',
        password: 'password123',
        name: 'Avatar User',
      });

      // Upload a dummy image to MinIO first
      const dummyImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      const tempKey = `temp/${user._id}/avatar.png`;
      await s3Service.putObject(
        BUCKETS.PUBLIC,
        tempKey,
        dummyImageBuffer,
        dummyImageBuffer.length,
        'image/png',
      );

      // Call updateAvatar
      const updatedUser = await userService.updateAvatar(
        user._id.toString(),
        tempKey,
      );

      expect(updatedUser.avatar).toBeDefined();
      expect(updatedUser.avatar).toBe(tempKey);

      // Verify image exists
      const exists = await s3Service.checkPublicObjectExists(
        BUCKETS.PUBLIC,
        tempKey,
      );
      expect(exists).toBe(true);

      // Check thumbnail generation (ImageService logic)
      const thumbnailKey = tempKey.replace('.png', '-thumb.png');
      const thumbExists = await s3Service.checkPublicObjectExists(
        BUCKETS.PUBLIC,
        thumbnailKey,
      );
      expect(thumbExists).toBe(true);
    });

    it('should throw BadRequestException if temporary image does not exist', async () => {
      const user = await userService.createUser({
        email: 'noimage@example.com',
        password: 'password123',
        name: 'No Image User',
      });

      await expect(
        userService.updateAvatar(user._id.toString(), 'nonexistent/image.png'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
