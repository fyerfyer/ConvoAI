import { Types, Model } from 'mongoose';
import { MemberDocument } from '../../../../modules/member/schemas/member.schema';

export interface CreateTestMemberOptions {
  guildId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  nickName?: string;
  roles?: Types.ObjectId[];
}

export class MemberFixturesHelper {
  constructor(private memberModel: Model<MemberDocument>) {}

  async createTestMember(
    options: CreateTestMemberOptions,
  ): Promise<MemberDocument> {
    const { guildId, userId, nickName, roles = [] } = options;

    const guildObjectId =
      typeof guildId === 'string' ? new Types.ObjectId(guildId) : guildId;
    const userObjectId =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    const member = new this.memberModel({
      guild: guildObjectId,
      user: userObjectId,
      nickName,
      roles,
    });

    return member.save();
  }
}
