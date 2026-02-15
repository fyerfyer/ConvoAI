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
import {
  ApiResponse,
  BotResponse,
  BotListResponse,
  CreateBotDTO,
  createBotDTOSchema,
  UpdateBotDTO,
  updateBotDTOSchema,
  JwtPayload,
} from '@discord-platform/shared';

@Controller('bots')
@UseGuards(JwtGuard)
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post()
  async createBot(
    @User() user: JwtPayload,
    @Body(new ZodValidationPipe(createBotDTOSchema)) dto: CreateBotDTO,
  ): Promise<ApiResponse<BotResponse & { webhookSecret: string }>> {
    const { bot, webhookSecret } = await this.botService.createBot(
      user.sub,
      dto,
    );
    return {
      data: { ...this.botService.toBotResponse(bot), webhookSecret },
      statusCode: HttpStatus.CREATED,
      message: 'Bot created successfully',
    };
  }

  @Get('guild/:guildId')
  async listBots(
    @Param('guildId') guildId: string,
  ): Promise<ApiResponse<BotListResponse>> {
    const bots = await this.botService.findBotsByGuild(guildId);
    return {
      data: { bots: bots.map((b) => this.botService.toBotResponse(b)) },
      statusCode: HttpStatus.OK,
    };
  }

  @Get(':botId')
  async getBot(
    @Param('botId') botId: string,
  ): Promise<ApiResponse<BotResponse>> {
    const bot = await this.botService.findById(botId);
    return {
      data: this.botService.toBotResponse(bot),
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
}
