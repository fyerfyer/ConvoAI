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
import {
  AttachmentPresignedUrlDTO,
  AttachmentValue,
  BUCKETS,
  CreateMessageDTO,
  MAX_ATTACHMENT_SIZE,
  MESSAGE_TYPE,
} from '@discord-platform/shared';
import { MessageProducer } from './message.producer';
import { ClientSession, Types, Document } from 'mongoose';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';
import { UserDocument } from '../user/schemas/user.schema';
import { S3Service } from '../../common/configs/s3/s3.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly messageProducer: MessageProducer,
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
        duration: att.duration,
      })),
    });

    await message.save({ session });

    const populatedMessage = await message.populate([
      { path: 'sender', select: 'name avatar isBot' },
      {
        path: 'replyTo',
        select: 'content sender',
        populate: { path: 'sender', select: 'name avatar isBot' },
      },
    ]);

    await this.messageProducer.publishMessageCreated(
      populatedMessage._id.toString(),
      channelId,
    );
    return populatedMessage;
  }

  // bullmq 从数据库中重新获取消息。
  async findMessageById(messageId: string): Promise<MessageDocument | null> {
    return this.messageModel
      .findById(messageId)
      .populate('sender', 'name avatar isBot')
      .populate({
        path: 'replyTo',
        select: 'content sender',
        populate: { path: 'sender', select: 'name avatar isBot' },
      })
      .exec();
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
      .populate({
        path: 'replyTo',
        select: 'content sender',
        populate: { path: 'sender', select: 'name avatar isBot' },
      })
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
      .populate({
        path: 'replyTo',
        select: 'content sender',
        populate: { path: 'sender', select: 'name avatar isBot' },
      })
      .exec() as Promise<MessageDocument>;
  }

  async toMessageResponse(message: MessageDocument) {
    // 确保消息已经 populated
    const populatedMessage = await this.populateMessage(message);

    // 处理 sender 被删除（例如 Bot 用户已被移除）的情况，返回占位信息而非抛错
    const senderPopulated =
      populatedMessage.sender && populatedMessage.sender instanceof Document;

    const sender = senderPopulated
      ? (populatedMessage.sender as unknown as UserDocument)
      : null;

    // Build replyTo response
    let replyToResponse:
      | {
          id: string;
          content: string;
          author: {
            id: string;
            name: string;
            avatar: string | null;
            isBot: boolean;
          };
        }
      | undefined;
    if (
      populatedMessage.replyTo &&
      populatedMessage.replyTo instanceof Document
    ) {
      const replyMsg = populatedMessage.replyTo;
      const replySender = replyMsg.sender;
      if (replySender && replySender instanceof Document) {
        replyToResponse = {
          id: replyMsg._id.toString(),
          content: replyMsg.content,
          author: {
            id: replySender._id.toString(),
            name: replySender.name,
            avatar: replySender.avatar,
            isBot: replySender.isBot,
          },
        };
      } else {
        replyToResponse = {
          id: replyMsg._id.toString(),
          content: replyMsg.content,
          author: { id: '', name: 'Unknown', avatar: null, isBot: false },
        };
      }
    }

    // Determine message type
    const messageType = populatedMessage.isSystem
      ? MESSAGE_TYPE.SYSTEM
      : populatedMessage.attachments.some((a) =>
            a.contentType.startsWith('audio/'),
          )
        ? MESSAGE_TYPE.VOICE
        : MESSAGE_TYPE.DEFAULT;

    return {
      id: populatedMessage._id.toString(),
      content: populatedMessage.content,
      channelId: (populatedMessage.channelId as Types.ObjectId).toString(),
      type: messageType,
      author: sender
        ? {
            id: sender._id.toString(),
            name: sender.name,
            avatar: sender.avatar,
            isBot: sender.isBot,
          }
        : {
            id: String(populatedMessage.sender ?? ''),
            name: '[Deleted User]',
            avatar: null,
            isBot: false,
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
            duration: att.duration,
            type: (att.contentType.startsWith('image/')
              ? 'image'
              : att.contentType.startsWith('video/')
                ? 'video'
                : att.contentType.startsWith('audio/')
                  ? 'audio'
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
      replyTo: replyToResponse,
      createdAt: populatedMessage.createdAt?.toISOString(),
      updatedAt: populatedMessage.updatedAt?.toISOString(),
    };
  }

  // 删除某个 sender 的所有消息（用于 Bot 删除时清理）
  async deleteMessagesBySender(senderId: string): Promise<number> {
    const result = await this.messageModel.deleteMany({
      sender: new Types.ObjectId(senderId),
    });
    return result.deletedCount;
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
