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
import {
  CreateBotDTO,
  UpdateBotDTO,
  BotResponse,
  BOT_STATUS,
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
  ) {}

  async createBot(
    ownerId: string,
    dto: CreateBotDTO,
  ): Promise<{ bot: BotDocument; webhookSecret: string }> {
    const guild = await this.guildModel.findById(dto.guildId);
    if (!guild) throw new NotFoundException('Guild not found');
    if (!guild?.owner || guild.owner.toString() !== ownerId) {
      throw new ForbiddenException('Only the guild owner can create bots');
    }

    const existingBot = await this.botModel.findOne({
      guildId: new Types.ObjectId(dto.guildId),
    });
    if (existingBot) {
      const existingUser = await this.userModel.findById(existingBot.userId);
      if (existingUser && existingUser.name === dto.name) {
        throw new BadRequestException(
          'A bot with this name already exists in the guild',
        );
      }
    }

    const webhookToken = randomBytes(32).toString('hex');
    const webhookSecret = randomBytes(32).toString('hex');
    const botUser = new this.userModel({
      email: `bot-${webhookToken.slice(0, 12)}@bot.discord-platform.local`,
      password: randomBytes(16).toString('hex'), // 随机创建一个密码，确保无法登录
      name: dto.name,
      avatar: dto.avatar || null,
      isBot: true,
    });
    await botUser.save();

    const bot = new this.botModel({
      userId: botUser._id,
      guildId: new Types.ObjectId(dto.guildId),
      type: dto.type,
      webhookUrl: dto.webhookUrl,
      webhookSecret,
      webhookToken,
      description: dto.description || '',
    });
    await bot.save();

    this.logger.log(
      `Bot "${dto.name}" created in guild ${dto.guildId} (token: ${webhookToken.slice(0, 8)}...)`,
    );

    return { bot, webhookSecret };
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
        status: BOT_STATUS.ACTIVE,
      })
      .populate('userId', 'name avatar isBot')
      .exec();
  }

  async findBotByNameInGuild(
    name: string,
    guildId: string,
  ): Promise<BotDocument | null> {
    const bots = await this.botModel
      .find({
        guildId: new Types.ObjectId(guildId),
        status: BOT_STATUS.ACTIVE,
      })
      .populate('userId', 'name avatar isBot')
      .exec();

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

    if (dto.name || dto.avatar) {
      const botUser = await this.userModel.findById(bot.userId);
      if (botUser) {
        if (dto.name) botUser.name = dto.name;
        if (dto.avatar) botUser.avatar = dto.avatar;
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

    bot.webhookToken = randomBytes(32).toString('hex');
    bot.webhookSecret = randomBytes(32).toString('hex');
    await bot.save();

    return {
      webhookToken: bot.webhookToken,
      webhookSecret: bot.webhookSecret,
    };
  }

  toBotResponse(bot: BotDocument): BotResponse {
    const user = bot.userId as unknown as UserDocument;
    const userId = user?._id ? user._id.toString() : String(bot.userId);
    return {
      id: bot._id.toString(),
      userId,
      name: user?.name || 'Unknown',
      avatar: user?.avatar || null,
      guildId: String(bot.guildId),
      type: bot.type,
      webhookUrl: bot.webhookUrl,
      webhookToken: bot.webhookToken,
      description: bot.description,
      status: bot.status,
      createdAt: bot.createdAt?.toISOString() || '',
      updatedAt: bot.updatedAt?.toISOString() || '',
    };
  }
}
