import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ChannelBot,
  ChannelBotDocument,
  ChannelBotModel,
} from './schemas/channel-bot.schema';
import { Bot, BotDocument, BotModel } from './schemas/bot.schema';
import { Channel, ChannelModel } from '../channel/schemas/channel.schema';
import { Guild, GuildModel } from '../guild/schemas/guild.schema';
import { UserDocument } from '../user/schemas/user.schema';
import {
  CreateChannelBotDTO,
  UpdateChannelBotDTO,
  ChannelBotResponse,
  BOT_STATUS,
  BOT_SCOPE,
  MEMORY_SCOPE,
  EXECUTION_MODE,
  LlmToolValue,
} from '@discord-platform/shared';
import { Types } from 'mongoose';

@Injectable()
export class ChannelBotService {
  private readonly logger = new Logger(ChannelBotService.name);

  constructor(
    @InjectModel(ChannelBot.name)
    private readonly channelBotModel: ChannelBotModel,
    @InjectModel(Bot.name) private readonly botModel: BotModel,
    @InjectModel(Channel.name) private readonly channelModel: ChannelModel,
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
  ) {}

  /**
   * 将 Bot 绑定到特定频道
   */
  async bindBotToChannel(
    ownerId: string,
    dto: CreateChannelBotDTO,
  ): Promise<ChannelBotDocument> {
    // 验证 Bot 存在
    const bot = await this.botModel
      .findById(dto.botId)
      .populate('userId', 'name avatar isBot');
    if (!bot) throw new NotFoundException('Bot not found');

    // 验证频道存在
    const channel = await this.channelModel.findById(dto.channelId);
    if (!channel) throw new NotFoundException('Channel not found');

    const guildId = String(channel.guild);

    // 验证 Bot 属于该频道所在的 Guild
    if (String(bot.guildId) !== guildId) {
      throw new BadRequestException(
        'Bot does not belong to the same guild as the channel',
      );
    }

    // 验证权限：只有 Guild Owner 可以操作
    const guild = await this.guildModel.findById(guildId);
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException(
        'Only the guild owner can bind bots to channels',
      );
    }

    // 检查是否已经绑定
    const existing = await this.channelBotModel.findOne({
      botId: new Types.ObjectId(dto.botId),
      channelId: new Types.ObjectId(dto.channelId),
    });
    if (existing) {
      throw new ConflictException('Bot is already bound to this channel');
    }

    const channelBot = new this.channelBotModel({
      botId: new Types.ObjectId(dto.botId),
      channelId: new Types.ObjectId(dto.channelId),
      guildId: new Types.ObjectId(guildId),
      enabled: dto.enabled ?? true,
      overridePrompt: dto.overridePrompt,
      overrideTools: dto.overrideTools,
      memoryScope: dto.memoryScope || MEMORY_SCOPE.CHANNEL,
      policy: dto.policy || {},
    });

    await channelBot.save();
    this.logger.log(
      `Bot ${dto.botId} bound to channel ${dto.channelId} in guild ${guildId}`,
    );

    return channelBot;
  }

  /**
   * 更新频道级 Bot 配置
   */
  async updateChannelBot(
    bindingId: string,
    ownerId: string,
    dto: UpdateChannelBotDTO,
  ): Promise<ChannelBotDocument> {
    const channelBot = await this.channelBotModel.findById(bindingId);
    if (!channelBot)
      throw new NotFoundException('Channel bot binding not found');

    // 验证权限
    const guild = await this.guildModel.findById(channelBot.guildId);
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException(
        'Only the guild owner can update channel bot bindings',
      );
    }

    if (dto.enabled !== undefined) channelBot.enabled = dto.enabled;
    if (dto.overridePrompt !== undefined) {
      channelBot.overridePrompt = dto.overridePrompt ?? undefined;
    }
    if (dto.overrideTools !== undefined) {
      channelBot.overrideTools =
        (dto.overrideTools as LlmToolValue[] | undefined) ?? undefined;
    }
    if (dto.memoryScope !== undefined) channelBot.memoryScope = dto.memoryScope;
    if (dto.policy !== undefined) {
      const currentPolicy = channelBot.policy || {
        canSummarize: true,
        canUseTools: true,
        maxTokensPerRequest: 4096,
      };
      channelBot.policy = {
        canSummarize: dto.policy.canSummarize ?? currentPolicy.canSummarize,
        canUseTools: dto.policy.canUseTools ?? currentPolicy.canUseTools,
        maxTokensPerRequest:
          dto.policy.maxTokensPerRequest ?? currentPolicy.maxTokensPerRequest,
      };
      channelBot.markModified('policy');
    }

    await channelBot.save();
    return channelBot;
  }

  /**
   * 解除频道 Bot 绑定
   */
  async unbindBot(bindingId: string, ownerId: string): Promise<void> {
    const channelBot = await this.channelBotModel.findById(bindingId);
    if (!channelBot)
      throw new NotFoundException('Channel bot binding not found');

    const guild = await this.guildModel.findById(channelBot.guildId);
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException(
        'Only the guild owner can unbind bots from channels',
      );
    }

    await this.channelBotModel.findByIdAndDelete(bindingId);
    this.logger.log(
      `Bot ${channelBot.botId} unbound from channel ${channelBot.channelId}`,
    );
  }

  /**
   * 获取特定 Bot 的所有频道绑定
   */
  async findBindingsByBot(botId: string): Promise<ChannelBotDocument[]> {
    return this.channelBotModel
      .find({ botId: new Types.ObjectId(botId) })
      .exec();
  }

  /**
   * 获取特定频道的所有活跃 Bot 绑定
   */
  async findActiveBindingsByChannel(
    channelId: string,
  ): Promise<ChannelBotDocument[]> {
    return this.channelBotModel
      .find({
        channelId: new Types.ObjectId(channelId),
        enabled: true,
      })
      .exec();
  }

  /**
   * 获取特定频道的所有 Bot 绑定（包括未启用的）
   */
  async findBindingsByChannel(
    channelId: string,
  ): Promise<ChannelBotDocument[]> {
    return this.channelBotModel
      .find({ channelId: new Types.ObjectId(channelId) })
      .exec();
  }

  /**
   * 获取特定 Guild 中 Bot 的绑定数量
   */
  async countBindingsByBot(botId: string): Promise<number> {
    return this.channelBotModel
      .countDocuments({ botId: new Types.ObjectId(botId) })
      .exec();
  }

  /**
   * 当 Bot 被删除时，清理所有频道绑定
   */
  async removeAllBindingsForBot(botId: string): Promise<void> {
    const result = await this.channelBotModel.deleteMany({
      botId: new Types.ObjectId(botId),
    });
    if (result.deletedCount > 0) {
      this.logger.log(
        `Removed ${result.deletedCount} channel bindings for bot ${botId}`,
      );
    }
  }

  /**
   * 当频道被删除时，清理所有 Bot 绑定
   */
  async removeAllBindingsForChannel(channelId: string): Promise<void> {
    const result = await this.channelBotModel.deleteMany({
      channelId: new Types.ObjectId(channelId),
    });
    if (result.deletedCount > 0) {
      this.logger.log(
        `Removed ${result.deletedCount} bot bindings for channel ${channelId}`,
      );
    }
  }

  /**
   * 序列化为前端响应格式
   */
  toChannelBotResponse(
    binding: ChannelBotDocument,
    bot?: BotDocument,
  ): ChannelBotResponse {
    const botUser = bot?.userId as unknown as UserDocument | undefined;
    return {
      id: binding._id.toString(),
      botId: String(binding.botId),
      botName: botUser?.name || 'Unknown',
      botAvatar: botUser?.avatar || null,
      channelId: String(binding.channelId),
      guildId: String(binding.guildId),
      executionMode: (bot?.executionMode as string) || EXECUTION_MODE.WEBHOOK,
      enabled: binding.enabled,
      overridePrompt: binding.overridePrompt,
      overrideTools: binding.overrideTools as string[] | undefined,
      memoryScope: binding.memoryScope || MEMORY_SCOPE.CHANNEL,
      policy: {
        canSummarize: binding.policy?.canSummarize ?? true,
        canUseTools: binding.policy?.canUseTools ?? true,
        maxTokensPerRequest: binding.policy?.maxTokensPerRequest ?? 2048,
      },
      createdAt: binding.createdAt?.toISOString() || '',
      updatedAt: binding.updatedAt?.toISOString() || '',
    };
  }
}
