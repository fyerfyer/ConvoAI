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
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { User } from '../../common/decorators/user.decorator';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';
import { BotService } from './bot.service';
import { ChannelBotService } from './channel-bot.service';
import { TemplateRegistry } from './templates/template-registry';
import {
  ApiResponse,
  BotResponse,
  BotListResponse,
  ChannelBotResponse,
  ChannelBotListResponse,
  ChannelSlashCommandsResponse,
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
    private readonly templateRegistry: TemplateRegistry,
  ) {}

  @Get('templates')
  async listTemplates(): Promise<ApiResponse<{ templates: TemplateInfo[] }>> {
    const templates = this.templateRegistry.listTemplates();
    return {
      data: { templates },
      statusCode: HttpStatus.OK,
    };
  }

  @Throttle({
    short: { limit: 2, ttl: 1000 },
    long: { limit: 10, ttl: 60000 },
  })
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
    const responses = await this.botService.findBotsByGuildWithCounts(guildId);
    return {
      data: { bots: responses },
      statusCode: HttpStatus.OK,
    };
  }

  @Get(':botId')
  async getBot(
    @Param('botId') botId: string,
  ): Promise<ApiResponse<BotResponse>> {
    const response = await this.botService.findByIdWithCount(botId);
    return {
      data: response,
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
    await this.botService.deleteBotCascade(botId, user.sub);
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

  @Get('channel/:channelId/commands')
  async listChannelCommands(
    @Param('channelId') channelId: string,
  ): Promise<ApiResponse<ChannelSlashCommandsResponse>> {
    const commands =
      await this.channelBotService.listChannelCommands(channelId);
    return {
      data: { commands },
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
