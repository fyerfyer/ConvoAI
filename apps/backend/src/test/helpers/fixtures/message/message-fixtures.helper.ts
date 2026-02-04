import { Model } from 'mongoose';
import { BaseFixturesHelper } from '../base-fixtures.helper';
import { MessageDocument } from '../../../../modules/chat/schemas/message.schema';

export class MessageFixturesHelper extends BaseFixturesHelper {
  constructor(private readonly messageModel: Model<MessageDocument>) {
    super();
  }

  async createTestMessage(
    overrides: Partial<MessageDocument> = {},
  ): Promise<MessageDocument> {
    const defaultMessage = {
      content: 'Hello, World!',
      sender: BaseFixturesHelper.generateObjectId(),
      channelId: BaseFixturesHelper.generateObjectId(),
      attachments: [],
      embed: [],
      isSystem: false,
      isEdited: false,
    };

    return this.messageModel.create({ ...defaultMessage, ...overrides });
  }

  async createMultipleMessages(
    count: number,
    overrides: Partial<MessageDocument> = {},
  ): Promise<MessageDocument[]> {
    const messages = [];
    for (let i = 0; i < count; i++) {
      messages.push(await this.createTestMessage(overrides));
    }
    return messages;
  }
}
