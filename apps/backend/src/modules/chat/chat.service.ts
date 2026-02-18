import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Message,
  MessageDocument,
  MessageModel,
} from './schemas/message.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AttachmentPresignedUrlDTO,
  AttachmentValue,
  BUCKETS,
  CreateMessageDTO,
  MAX_ATTACHMENT_SIZE,
  MESSAGE_EVENT,
} from '@discord-platform/shared';
import { ClientSession, Types, Document } from 'mongoose';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';
import { S3Service } from '../../common/configs/s3/s3.service';

@Injectable()
export class ChatService {
  constructor(
    private eventEmitter: EventEmitter2,
    @InjectModel(Message.name) private readonly messageModel: MessageModel,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
    private readonly s3Service: S3Service,
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
      .session(session ?? null);

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
      attachments: (createMessageDTO.attachments || []).map((att) => ({
        filename: att.fileName,
        url: att.url,
        contentType: att.contentType,
        size: att.size,
      })),
    });

    await message.save({ session });

    const populatedMessage = await message.populate([
      { path: 'sender', select: 'name avatar isBot' },
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
      .populate('sender', 'name avatar isBot')
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
      .populate('sender', 'name avatar isBot')
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
      attachments: await Promise.all(
        populatedMessage.attachments.map(async (att) => {
          // 为私有 bucket 的附件生成预签名 GET URL
          let url = att.url;
          const publicBase =
            process.env.S3_PUBLIC_URL || 'http://localhost:9000';
          const privatePrefix = `${publicBase}/${BUCKETS.PRIVATE}/`;
          if (att.url.startsWith(privatePrefix)) {
            const key = att.url.slice(privatePrefix.length);
            try {
              url = await this.s3Service.getGetUrl(BUCKETS.PRIVATE, key, 3600);
            } catch {
              // 如果生成失败，保留原 URL
            }
          }
          return {
            url,
            filename: att.filename,
            size: att.size,
            type: (att.contentType.startsWith('image/')
              ? 'image'
              : att.contentType.startsWith('video/')
                ? 'video'
                : 'file') as AttachmentValue,
          };
        }),
      ),
      embeds: (populatedMessage.embed ?? []).map((emb) => ({
        title: emb.title,
        description: emb.description,
        url: emb.url,
        image: emb.image ? { url: emb.image } : undefined,
        thumbnail: emb.thumbnail ? { url: emb.thumbnail } : undefined,
        fields: emb.fields?.map((f) => ({
          name: f.name,
          value: f.value,
          inline: f.inline,
        })),
        footer: emb.footer
          ? { text: emb.footer.text, icon_url: emb.footer.icon_url }
          : undefined,
        timestamp: emb.timestamp?.toISOString(),
      })),
      createdAt: populatedMessage.createdAt?.toISOString(),
      updatedAt: populatedMessage.updatedAt?.toISOString(),
    };
  }

  async getAttachmentPresignedUrl(
    userId: string,
    channelId: string,
    dto: AttachmentPresignedUrlDTO,
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    const channelObjectId = new Types.ObjectId(channelId);
    const channel = await this.channelModel.exists({ _id: channelObjectId });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (dto.size > MAX_ATTACHMENT_SIZE) {
      const maxMB = Math.round(MAX_ATTACHMENT_SIZE / (1024 * 1024));
      throw new BadRequestException(
        `File "${dto.fileName}" exceeds the maximum size of ${maxMB}MB`,
      );
    }

    const timestamp = Date.now();
    const sanitizedName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `attachments/${channelId}/${userId}/${timestamp}-${sanitizedName}`;

    const uploadUrl = await this.s3Service.getPutUrl(
      BUCKETS.PRIVATE,
      key,
      dto.contentType,
      600, // 10 mins
    );

    const fileUrl = this.s3Service.getPublicUrl(BUCKETS.PRIVATE, key);

    return { uploadUrl, fileUrl, key };
  }
}
