import { Types } from 'mongoose';

export class BaseFixturesHelper {
  static generateObjectId(): Types.ObjectId {
    return new Types.ObjectId();
  }
}
