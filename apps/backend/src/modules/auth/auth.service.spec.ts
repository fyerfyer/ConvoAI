import { Test, TestingModule } from '@nestjs/testing';
import {
  MongooseModule,
  getModelToken,
  getConnectionToken,
} from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import {
  User,
  userSchema,
  UserDocument,
  UserModel,
} from '../user/schemas/user.schema';
import { TestDatabaseHelper, TestRedisHelper } from '../../test/helpers';
import { LoginDTO, RegisterDTO } from '@discord-platform/shared';
import { Model, Connection } from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ImageService } from '../media/services/image.service';
import { S3Service } from '../../common/configs/s3/s3.service';
import { AppLogger } from '../../common/configs/logger/logger.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { StringValue } from 'ms';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

describe('AuthService', () => {
  let module: TestingModule;
  let authService: AuthService;
  let userModel: Model<UserDocument>;
  let s3Client: S3Client;
  let connection: Connection;

  beforeAll(async () => {
    await TestDatabaseHelper.connect();
    await TestRedisHelper.connect();

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27020';
    const dbName = process.env.MONGODB_NAME || 'discord-test';

    s3Client = new S3Client({
      endpoint: 'http://localhost:9002',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin123',
      },
      forcePathStyle: true,
    });

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
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            secret: configService.get<string>('JWT_SECRET'),
            signOptions: {
              expiresIn: configService.get<string>('JWT_EXPIRE') as StringValue,
            },
          }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        AuthService,
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

    authService = module.get<AuthService>(AuthService);
    userModel = module.get<UserModel>(getModelToken(User.name));
    connection = module.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    if (module) await module.close();
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

  describe('register', () => {
    const registerDTO: RegisterDTO = {
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      name: 'Test User',
    };

    it('should register a new user successfully', async () => {
      const result = await authService.register(registerDTO);

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(registerDTO.email);
      expect(result.user.name).toBe(registerDTO.name);
      expect(result.user.id).toBeDefined();

      // Verify user is in database
      const savedUser = await userModel.findOne({ email: registerDTO.email });
      expect(savedUser).toBeDefined();
      expect(savedUser?.name).toBe(registerDTO.name);
    });

    it('should throw Error (from UserService) if email already exists', async () => {
      await authService.register(registerDTO);

      await expect(authService.register(registerDTO)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    const registerDTO: RegisterDTO = {
      email: 'login@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      name: 'Login User',
    };

    beforeEach(async () => {
      await authService.register(registerDTO);
    });

    it('should login successfully with valid credentials', async () => {
      const loginDTO: LoginDTO = {
        email: registerDTO.email,
        password: registerDTO.password,
      };

      const result = await authService.login(loginDTO);

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user.email).toBe(registerDTO.email);
    });

    it('should throw UnauthorizedException with invalid password', async () => {
      const loginDTO: LoginDTO = {
        email: registerDTO.email,
        password: 'wrongpassword',
      };

      await expect(authService.login(loginDTO)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException with non-existent email', async () => {
      const loginDTO: LoginDTO = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      await expect(authService.login(loginDTO)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
