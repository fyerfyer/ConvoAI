import { Types, Model } from 'mongoose';
import { UserDocument } from '../../../../modules/user/schemas/user.schema';
import { STATUS, StatusValue } from '@discord-platform/shared';

export interface CreateTestUserOptions {
  _id?: Types.ObjectId;
  email?: string;
  password?: string;
  name?: string;
  avatar?: string | null;
  banner?: string | null;
  status?: StatusValue;
  isBot?: boolean;
}

export class UserFixturesHelper {
  constructor(private userModel: Model<UserDocument>) {}

  async createTestUser(
    options: CreateTestUserOptions = {},
  ): Promise<UserDocument> {
    const userId = options._id || new Types.ObjectId();
    const {
      email = `test-${userId}@example.com`,
      password = 'testPassword123!',
      name = `TestUser-${userId.toString().slice(-6)}`,
      avatar = null,
      banner = null,
      status = STATUS.ONLINE,
      isBot = false,
    } = options;

    const user = new this.userModel({
      _id: userId,
      email,
      password,
      name,
      avatar,
      banner,
      status,
      isBot,
    });

    return user.save();
  }

  async createMultipleUsers(
    count: number,
    overrides: CreateTestUserOptions = {},
  ): Promise<UserDocument[]> {
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push(await this.createTestUser(overrides));
    }
    return users;
  }
}
