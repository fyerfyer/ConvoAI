import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Bot, BotDocument, BotModel } from './schemas/bot.schema';
import { User, UserDocument, UserModel } from '../user/schemas/user.schema';
import { Guild, GuildModel } from '../guild/schemas/guild.schema';
import { EncryptionService } from './crypto/encryption.service';
import {
  CreateBotDTO,
  UpdateBotDTO,
  BotResponse,
  BOT_STATUS,
  EXECUTION_MODE,
  TEMPLATE_CONFIG_SCHEMAS,
} from '@discord-platform/shared';
import { Types } from 'mongoose';
import { randomBytes } from 'crypto';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @InjectModel(Bot.name) private readonly botModel: BotModel,
    @InjectModel(User.name) private readonly userModel: UserModel,
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createBot(
    ownerId: string,
    dto: CreateBotDTO,
  ): Promise<{ bot: BotDocument; webhookSecret?: string }> {
    const guild = await this.guildModel.findById(dto.guildId);
    if (!guild) throw new NotFoundException('Guild not found');
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException('Only the guild owner can create bots');
    }

    // 检查同名 Bot
    const existingBots = await this.botModel
      .find({
        guildId: new Types.ObjectId(dto.guildId),
      })
      .populate('userId', 'name');
    for (const existingBot of existingBots) {
      const existingUser = existingBot.userId as unknown as { name: string };
      if (existingUser && existingUser.name === dto.name) {
        throw new BadRequestException(
          'A bot with this name already exists in the guild',
        );
      }
    }

    const executionMode = dto.executionMode || EXECUTION_MODE.WEBHOOK;

    // 验证模板配置
    if (executionMode === EXECUTION_MODE.BUILTIN && dto.templateId) {
      this.validateTemplateConfig(dto.templateId, dto.templateConfig);
    }

    // 所有 Bot 都生成唯一 webhookToken（避免 MongoDB unique index null 冲突）
    const webhookToken = randomBytes(32).toString('hex');
    let webhookSecret: string | undefined;
    if (executionMode === EXECUTION_MODE.WEBHOOK) {
      webhookSecret = randomBytes(32).toString('hex');
    }

    // 创建 Bot 用户
    const tokenPrefix =
      webhookToken?.slice(0, 12) || randomBytes(12).toString('hex');
    const botUser = new this.userModel({
      email: `bot-${tokenPrefix}@bot.discord-platform.local`,
      password: randomBytes(16).toString('hex'),
      name: dto.name,
      avatar: dto.avatar || null,
      isBot: true,
    });
    await botUser.save();

    // 构建 Bot 文档
    const botData: Record<string, unknown> = {
      userId: botUser._id,
      guildId: new Types.ObjectId(dto.guildId),
      type: dto.type,
      executionMode,
      description: dto.description || '',
    };

    // 所有模式都写入 webhookToken（保证唯一性）
    botData.webhookToken = webhookToken;

    // 按执行模式设置对应字段
    if (executionMode === EXECUTION_MODE.WEBHOOK) {
      botData.webhookUrl = dto.webhookUrl;
      botData.webhookSecret = webhookSecret;
    } else if (executionMode === EXECUTION_MODE.BUILTIN) {
      botData.templateId = dto.templateId;
      botData.templateConfig = dto.templateConfig || {};
    } else if (executionMode === EXECUTION_MODE.MANAGED_LLM && dto.llmConfig) {
      botData.llmConfig = {
        ...dto.llmConfig,
        apiKey: this.encryptionService.encrypt(dto.llmConfig.apiKey),
      };
    }

    const bot = new this.botModel(botData);
    await bot.save();

    this.logger.log(
      `Bot "${dto.name}" created in guild ${dto.guildId} (mode: ${executionMode})`,
    );

    return { bot, webhookSecret };
  }

  private validateTemplateConfig(
    templateId: string,
    config?: Record<string, unknown>,
  ): void {
    const schema = TEMPLATE_CONFIG_SCHEMAS[templateId];
    if (!schema) return;
    if (config) {
      const result = schema.safeParse(config);
      if (!result.success) {
        throw new BadRequestException(
          `Invalid template config: ${result.error.message}`,
        );
      }
    }
  }

  async findById(botId: string): Promise<BotDocument> {
    const bot = await this.botModel
      .findById(botId)
      .populate('userId', 'name avatar isBot');
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  async findByWebhookToken(token: string): Promise<BotDocument> {
    const bot = await this.botModel
      .findOne({ webhookToken: token })
      .populate('userId', 'name avatar isBot');
    if (!bot) throw new NotFoundException('Invalid webhook token');
    return bot;
  }

  async findBotsByGuild(guildId: string): Promise<BotDocument[]> {
    return this.botModel
      .find({
        guildId: new Types.ObjectId(guildId),
      })
      .populate('userId', 'name avatar isBot')
      .exec();
  }

  async findActiveBotsByGuild(guildId: string): Promise<BotDocument[]> {
    return this.botModel
      .find({
        guildId: new Types.ObjectId(guildId),
        status: BOT_STATUS.ACTIVE,
      })
      .select('+webhookSecret +llmConfig.apiKey')
      .populate('userId', 'name avatar isBot')
      .exec();
  }

  async findBotByNameInGuild(
    name: string,
    guildId: string,
  ): Promise<BotDocument | null> {
    const bots = await this.findActiveBotsByGuild(guildId);

    return (
      bots.find((bot) => {
        const user = bot.userId as unknown as UserDocument;
        return user?.name?.toLowerCase() === name.toLowerCase();
      }) || null
    );
  }

  async getBotNamesInGuild(
    guildId: string,
  ): Promise<Array<{ botId: string; name: string }>> {
    const bots = await this.findBotsByGuild(guildId);
    return bots.map((bot) => ({
      botId: bot._id.toString(),
      name: (bot.userId as unknown as UserDocument).name,
    }));
  }

  async updateBot(
    botId: string,
    ownerId: string,
    dto: UpdateBotDTO,
  ): Promise<BotDocument> {
    const bot = await this.findById(botId);
    const guild = await this.guildModel.findById(bot.guildId);
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException('Only the guild owner can update bots');
    }

    if (dto.webhookUrl !== undefined) bot.webhookUrl = dto.webhookUrl;
    if (dto.description !== undefined) bot.description = dto.description;
    if (dto.status !== undefined) bot.status = dto.status;

    // 模板配置更新
    if (dto.templateConfig !== undefined) {
      if (bot.templateId) {
        this.validateTemplateConfig(bot.templateId, dto.templateConfig);
      }
      bot.templateConfig = dto.templateConfig;
    }

    // LLM 配置更新
    if (dto.llmConfig !== undefined && bot.llmConfig) {
      const currentConfig = bot.llmConfig;
      if (dto.llmConfig.provider !== undefined)
        currentConfig.provider = dto.llmConfig.provider;
      if (dto.llmConfig.model !== undefined)
        currentConfig.model = dto.llmConfig.model;
      if (dto.llmConfig.systemPrompt !== undefined)
        currentConfig.systemPrompt = dto.llmConfig.systemPrompt;
      if (dto.llmConfig.temperature !== undefined)
        currentConfig.temperature = dto.llmConfig.temperature;
      if (dto.llmConfig.maxTokens !== undefined)
        currentConfig.maxTokens = dto.llmConfig.maxTokens;
      if (dto.llmConfig.customBaseUrl !== undefined)
        currentConfig.customBaseUrl = dto.llmConfig.customBaseUrl;
      if (dto.llmConfig.apiKey !== undefined) {
        currentConfig.apiKey = this.encryptionService.encrypt(
          dto.llmConfig.apiKey,
        );
      }
      bot.markModified('llmConfig');
    }

    if (dto.name || dto.avatar !== undefined) {
      const botUser = await this.userModel.findById(bot.userId);
      if (botUser) {
        if (dto.name) botUser.name = dto.name;
        if (dto.avatar !== undefined) botUser.avatar = dto.avatar || '';
        await botUser.save();
      }
    }

    await bot.save();
    return this.findById(botId);
  }

  async deleteBot(botId: string, ownerId: string): Promise<void> {
    const bot = await this.findById(botId);
    const guild = await this.guildModel.findById(bot.guildId);
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException('Only the guild owner can delete bots');
    }

    // 移除用户与 Bot 配置
    await this.userModel.findByIdAndDelete(bot.userId);
    await this.botModel.findByIdAndDelete(botId);

    this.logger.log(`Bot ${botId} deleted from guild ${guild._id}`);
  }

  async regenerateToken(
    botId: string,
    ownerId: string,
  ): Promise<{ webhookToken: string; webhookSecret: string }> {
    const bot = await this.botModel.findById(botId).select('+webhookSecret');
    if (!bot) throw new NotFoundException('Bot not found');

    const guild = await this.guildModel.findById(bot.guildId);
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException(
        'Only the guild owner can regenerate tokens',
      );
    }

    if (bot.executionMode && bot.executionMode !== EXECUTION_MODE.WEBHOOK) {
      throw new BadRequestException(
        'Token regeneration is only available for webhook mode bots',
      );
    }

    bot.webhookToken = randomBytes(32).toString('hex');
    bot.webhookSecret = randomBytes(32).toString('hex');
    await bot.save();

    return {
      webhookToken: bot.webhookToken,
      webhookSecret: bot.webhookSecret,
    };
  }

  // ── 响应序列化 ──
  toBotResponse(bot: BotDocument): BotResponse {
    const user = bot.userId as unknown as UserDocument;
    const userId = user?._id ? user._id.toString() : String(bot.userId);

    const response: BotResponse = {
      id: bot._id.toString(),
      userId,
      name: user?.name || 'Unknown',
      avatar: user?.avatar || null,
      guildId: String(bot.guildId),
      type: bot.type,
      executionMode: bot.executionMode || EXECUTION_MODE.WEBHOOK,
      description: bot.description,
      status: bot.status,
      createdAt: bot.createdAt?.toISOString() || '',
      updatedAt: bot.updatedAt?.toISOString() || '',
    };

    // Webhook 模式
    if (bot.executionMode === EXECUTION_MODE.WEBHOOK || !bot.executionMode) {
      response.webhookUrl = bot.webhookUrl;
    }

    // Builtin 模式
    if (bot.executionMode === EXECUTION_MODE.BUILTIN) {
      response.templateId = bot.templateId;
      response.templateConfig = bot.templateConfig;
    }

    // Managed LLM 模式 (不返回 apiKey)
    if (bot.executionMode === EXECUTION_MODE.MANAGED_LLM && bot.llmConfig) {
      response.llmConfig = {
        provider: bot.llmConfig.provider,
        model: bot.llmConfig.model,
        systemPrompt: bot.llmConfig.systemPrompt,
        temperature: bot.llmConfig.temperature,
        maxTokens: bot.llmConfig.maxTokens,
        tools: bot.llmConfig.tools,
        customBaseUrl: bot.llmConfig.customBaseUrl,
      };
    }

    return response;
  }
}
