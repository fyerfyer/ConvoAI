import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { User } from '../../common/decorators/user.decorator';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { BotService } from './bot.service';
import { ChannelBotService } from './channel-bot.service';
import { ChatService } from '../chat/chat.service';
import { TemplateRegistry } from './templates/template-registry';
import {
  ApiResponse,
  BotResponse,
  BotListResponse,
  ChannelBotResponse,
  ChannelBotListResponse,
  CreateBotDTO,
  createBotDTOSchema,
  UpdateBotDTO,
  updateBotDTOSchema,
  CreateChannelBotDTO,
  createChannelBotDTOSchema,
  UpdateChannelBotDTO,
  updateChannelBotDTOSchema,
  JwtPayload,
  TemplateInfo,
} from '@discord-platform/shared';

@Controller('bots')
@UseGuards(JwtGuard)
export class BotController {
  constructor(
    private readonly botService: BotService,
    private readonly channelBotService: ChannelBotService,
    private readonly chatService: ChatService,
    private readonly templateRegistry: TemplateRegistry,
  ) {}

  // ── Bot Definition (Guild-level) ──

  @Get('templates')
  async listTemplates(): Promise<ApiResponse<{ templates: TemplateInfo[] }>> {
    const templates = this.templateRegistry.listTemplates();
    return {
      data: { templates },
      statusCode: HttpStatus.OK,
    };
  }

  @Post()
  async createBot(
    @User() user: JwtPayload,
    @Body(new ZodValidationPipe(createBotDTOSchema)) dto: CreateBotDTO,
  ): Promise<ApiResponse<BotResponse & { webhookSecret?: string }>> {
    const { bot, webhookSecret } = await this.botService.createBot(
      user.sub,
      dto,
    );
    return {
      data: {
        ...this.botService.toBotResponse(bot),
        webhookToken: bot.webhookToken,
        webhookSecret,
      },
      statusCode: HttpStatus.CREATED,
      message: 'Bot created successfully',
    };
  }

  @Get('guild/:guildId')
  async listBots(
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<BotListResponse>> {
    const bots = await this.botService.findBotsByGuild(guildId);
    // 获取每个 Bot 的频道绑定数量
    const responses = await Promise.all(
      bots.map(async (b) => {
        const bindingCount = await this.channelBotService.countBindingsByBot(
          b._id.toString(),
        );
        return this.botService.toBotResponse(b, bindingCount);
      }),
    );
    return {
      data: { bots: responses },
      statusCode: HttpStatus.OK,
    };
  }

  @Get(':botId')
  async getBot(
    @Param('botId') botId: string,
  ): Promise<ApiResponse<BotResponse>> {
    const bot = await this.botService.findById(botId);
    const bindingCount = await this.channelBotService.countBindingsByBot(botId);
    return {
      data: this.botService.toBotResponse(bot, bindingCount),
      statusCode: HttpStatus.OK,
    };
  }

  @Put(':botId')
  async updateBot(
    @User() user: JwtPayload,
    @Param('botId') botId: string,
    @Body(new ZodValidationPipe(updateBotDTOSchema)) dto: UpdateBotDTO,
  ): Promise<ApiResponse<BotResponse>> {
    const bot = await this.botService.updateBot(botId, user.sub, dto);
    return {
      data: this.botService.toBotResponse(bot),
      statusCode: HttpStatus.OK,
      message: 'Bot updated successfully',
    };
  }

  @Delete(':botId')
  async deleteBot(
    @User() user: JwtPayload,
    @Param('botId') botId: string,
  ): Promise<ApiResponse<null>> {
    // 获取 Bot 信息以拿到 userId（用于级联删除消息）
    const bot = await this.botService.findById(botId);
    const botUserId = bot.userId?._id
      ? bot.userId._id.toString()
      : String(bot.userId);

    // 级联清理：频道绑定 → Bot 消息 → Bot 定义 + 用户
    await this.channelBotService.removeAllBindingsForBot(botId);
    await this.chatService.deleteMessagesBySender(botUserId);
    await this.botService.deleteBot(botId, user.sub);
    return {
      statusCode: HttpStatus.OK,
      message: 'Bot deleted successfully',
    };
  }

  @Post(':botId/regenerate-token')
  async regenerateToken(
    @User() user: JwtPayload,
    @Param('botId') botId: string,
  ): Promise<ApiResponse<{ webhookToken: string; webhookSecret: string }>> {
    const result = await this.botService.regenerateToken(botId, user.sub);
    return {
      data: result,
      statusCode: HttpStatus.OK,
      message: 'Webhook credentials regenerated',
    };
  }

  @Post('channel-bindings')
  async bindBotToChannel(
    @User() user: JwtPayload,
    @Body(new ZodValidationPipe(createChannelBotDTOSchema))
    dto: CreateChannelBotDTO,
  ): Promise<ApiResponse<ChannelBotResponse>> {
    const binding = await this.channelBotService.bindBotToChannel(
      user.sub,
      dto,
    );
    const bot = await this.botService.findById(String(binding.botId));
    return {
      data: this.channelBotService.toChannelBotResponse(binding, bot),
      statusCode: HttpStatus.CREATED,
      message: 'Bot bound to channel successfully',
    };
  }

  @Get(':botId/channel-bindings')
  async listBotBindings(
    @Param('botId') botId: string,
  ): Promise<ApiResponse<ChannelBotListResponse>> {
    const bindings = await this.channelBotService.findBindingsByBot(botId);
    const bot = await this.botService.findById(botId);
    return {
      data: {
        channelBots: bindings.map((b) =>
          this.channelBotService.toChannelBotResponse(b, bot),
        ),
      },
      statusCode: HttpStatus.OK,
    };
  }

  @Get('channel/:channelId/bots')
  async listChannelBots(
    @Param('channelId') channelId: string,
  ): Promise<ApiResponse<ChannelBotListResponse>> {
    const bindings =
      await this.channelBotService.findBindingsByChannel(channelId);
    // 加载每个绑定对应的 Bot 定义
    const channelBots = await Promise.all(
      bindings.map(async (binding) => {
        try {
          const bot = await this.botService.findById(String(binding.botId));
          return this.channelBotService.toChannelBotResponse(binding, bot);
        } catch {
          return this.channelBotService.toChannelBotResponse(binding);
        }
      }),
    );
    return {
      data: { channelBots },
      statusCode: HttpStatus.OK,
    };
  }

  @Put('channel-bindings/:bindingId')
  async updateChannelBot(
    @User() user: JwtPayload,
    @Param('bindingId') bindingId: string,
    @Body(new ZodValidationPipe(updateChannelBotDTOSchema))
    dto: UpdateChannelBotDTO,
  ): Promise<ApiResponse<ChannelBotResponse>> {
    const binding = await this.channelBotService.updateChannelBot(
      bindingId,
      user.sub,
      dto,
    );
    const bot = await this.botService.findById(String(binding.botId));
    return {
      data: this.channelBotService.toChannelBotResponse(binding, bot),
      statusCode: HttpStatus.OK,
      message: 'Channel bot configuration updated',
    };
  }

  @Delete('channel-bindings/:bindingId')
  async unbindBot(
    @User() user: JwtPayload,
    @Param('bindingId') bindingId: string,
  ): Promise<ApiResponse<null>> {
    await this.channelBotService.unbindBot(bindingId, user.sub);
    return {
      statusCode: HttpStatus.OK,
      message: 'Bot unbound from channel',
    };
  }
}
