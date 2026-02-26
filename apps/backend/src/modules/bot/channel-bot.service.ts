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
  MEMORY_SCOPE,
  EXECUTION_MODE,
  BOT_STATUS,
  LlmToolValue,
  ChannelSlashCommandInfo,
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

  async findBindingsByBot(botId: string): Promise<ChannelBotDocument[]> {
    return this.channelBotModel
      .find({ botId: new Types.ObjectId(botId) })
      .exec();
  }

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

  async findBindingsByChannel(
    channelId: string,
  ): Promise<ChannelBotDocument[]> {
    return this.channelBotModel
      .find({ channelId: new Types.ObjectId(channelId) })
      .exec();
  }

  async countBindingsByBot(botId: string): Promise<number> {
    return this.channelBotModel
      .countDocuments({ botId: new Types.ObjectId(botId) })
      .exec();
  }

  async listChannelCommands(
    channelId: string,
  ): Promise<ChannelSlashCommandInfo[]> {
    const bindings = await this.findActiveBindingsByChannel(channelId);

    let guildId: string | undefined;
    if (bindings.length > 0) {
      guildId = String(bindings[0].guildId);
    } else {
      const channel = await this.channelModel
        .findById(channelId)
        .select('guild')
        .lean()
        .exec();
      if (channel?.guild) {
        guildId = String(channel.guild);
      }
    }

    if (!guildId) {
      return [];
    }

    const commands: ChannelSlashCommandInfo[] = [];
    const seenBotIds = new Set<string>();

    // 1. 获取显式绑定的 Bot 命令
    for (const binding of bindings) {
      const botId = String(binding.botId);
      if (seenBotIds.has(botId)) continue;
      seenBotIds.add(botId);
      try {
        const bot = await this.botModel
          .findById(botId)
          .populate('userId', 'name')
          .lean()
          .exec();
        if (!bot) continue;
        const botUser = bot.userId as unknown as { name: string };
        for (const cmd of bot.commands || []) {
          if (!cmd.name) continue;
          commands.push({
            name: cmd.name,
            description: cmd.description || '',
            botName: botUser?.name || 'Bot',
            botId,
            params: (cmd.params || []).map((p) => ({
              name: p.name,
              description: p.description || '',
              type: p.type || 'string',
              required: p.required ?? false,
            })),
          });
        }
      } catch {
        // skip deleted bots
      }
    }

    // 2. 获取 Guild-scope 的 Bot 命令
    const guildBots = await this.botModel
      .find({
        guildId: new Types.ObjectId(guildId),
        status: BOT_STATUS.ACTIVE,
      })
      .populate('userId', 'name')
      .lean()
      .exec();

    for (const bot of guildBots) {
      const botId = bot._id.toString();
      if (seenBotIds.has(botId)) continue;
      seenBotIds.add(botId);
      const botUser = bot.userId as unknown as { name: string };
      for (const cmd of bot.commands || []) {
        if (!cmd.name) continue;
        commands.push({
          name: cmd.name,
          description: cmd.description || '',
          botName: botUser?.name || 'Bot',
          botId,
          params: (cmd.params || []).map((p) => ({
            name: p.name,
            description: p.description || '',
            type: p.type || 'string',
            required: p.required ?? false,
          })),
        });
      }
    }

    return commands;
  }

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
