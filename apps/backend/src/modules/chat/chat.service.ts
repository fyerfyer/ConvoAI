import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Message,
  MessageDocument,
  MessageModel,
} from './schemas/message.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateMessageDTO, MESSAGE_EVENT } from '@discord-platform/shared';
import { ClientSession, Types, Document } from 'mongoose';
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
      { path: 'sender', select: 'name avatar' },
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
      .populate('sender', 'name avatar')
      .populate('replyTo', 'content sender')
      .exec();
  }
  async populateMessage(message: MessageDocument): Promise<MessageDocument> {
    // 如果已经 populated，直接返回
    if (message.sender && message.sender instanceof Document) {
      return message;
    }

    // 否则手动 populate
    return this.messageModel
      .findById(message._id)
      .populate('sender', 'name avatar')
      .populate('replyTo', 'content sender')
      .exec() as Promise<MessageDocument>;
  }

  async toMessageResponse(message: MessageDocument) {
    // 确保消息已经 populated
    const populatedMessage = await this.populateMessage(message);

    if (
      !populatedMessage.sender ||
      !(populatedMessage.sender instanceof Document)
    ) {
      throw new Error('Message sender not populated');
    }

    const sender = populatedMessage.sender;

    return {
      id: populatedMessage._id.toString(),
      content: populatedMessage.content,
      channelId: (populatedMessage.channelId as Types.ObjectId).toString(),
      author: {
        id: sender._id.toString(),
        name: sender.name,
        avatar: sender.avatar,
        isBot: sender.isBot,
      },
      attachments: populatedMessage.attachments.map((att) => ({
        url: att.url,
        filename: att.filename,
        size: att.size,
        type: att.contentType.startsWith('image/')
          ? 'image'
          : att.contentType.startsWith('video/')
            ? 'video'
            : 'file',
      })),
      createdAt: populatedMessage.createdAt?.toISOString(),
      updatedAt: populatedMessage.updatedAt?.toISOString(),
    };
  }
}
