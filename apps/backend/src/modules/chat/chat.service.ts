import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Message,
  MessageDocument,
  MessageModel,
} from './schemas/message.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateMessageDTO, MESSAGE_EVENT } from '@discord-platform/shared';
import { ClientSession, Types } from 'mongoose';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';

@Injectable()
export class ChatService {
  constructor(
    private eventEmitter: EventEmitter2,
    @InjectModel(Message.name) private readonly messageModel: MessageModel,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
  ) {}

  async createMessage(
    senderId: string,
    createMessageDTO: CreateMessageDTO,
    session?: ClientSession,
  ): Promise<MessageDocument> {
    const { channelId } = createMessageDTO;
    const channelObjectId = new Types.ObjectId(channelId);
    const channel = await this.channelModel
      .exists({ _id: channelObjectId })
      .session(session);

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const senderObjectId = new Types.ObjectId(senderId);

    const message = new this.messageModel({
      content: createMessageDTO.content,
      sender: senderObjectId,
      channelId: channelObjectId,
      replyTo: createMessageDTO.replyTo
        ? new Types.ObjectId(createMessageDTO.replyTo)
        : null,
      attachments: createMessageDTO.attachments || [],
    });

    await message.save({ session });

    const populatedMessage = await message.populate([
      { path: 'sender', select: 'username avatar' },
      { path: 'replyTo', select: 'content sender' },
    ]);

    this.eventEmitter.emit(MESSAGE_EVENT.CREATE_MESSAGE, populatedMessage);
    return populatedMessage;
  }

  // TODO：当前是获取 beforeId 之前的消息，后续可以加上 afterId 和 aroundId
  async getMessages(
    channelId: string,
    limit = 50,
    beforeId?: string,
  ): Promise<MessageDocument[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = { channelId: new Types.ObjectId(channelId) };

    if (beforeId) {
      query._id = { $lt: new Types.ObjectId(beforeId) };
    }

    return this.messageModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .populate('sender', 'username avatar')
      .populate('replyTo', 'content sender')
      .exec();
  }
}
