import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { ChatService } from './chat.service';
import {
  ApiResponse,
  CreateMessageDTO,
  createMessageDTOSchema,
  JwtPayload,
  MessageListResponse,
  MessageResponse,
} from '@discord-platform/shared';
import { User } from '../../common/decorators/user.decorator';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';

@Controller('channels/:channelId/messages')
@UseGuards(JwtGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createMessageDTOSchema))
  async createMessage(
    @User() user: JwtPayload,
    @Body() createMessageDTO: CreateMessageDTO,
  ): Promise<ApiResponse<MessageResponse>> {
    const message = await this.chatService.createMessage(
      user.sub,
      createMessageDTO,
    );
    return {
      data: await this.chatService.toMessageResponse(message),
      statusCode: HttpStatus.CREATED,
      message: 'Message sent successfully',
    };
  }

  @Get()
  async getMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: number,
    @Query('beforeId') beforeId?: string,
  ): Promise<ApiResponse<MessageListResponse>> {
    const messages = await this.chatService.getMessages(
      channelId,
      limit,
      beforeId,
    );
    const mappedMessages = await Promise.all(
      messages.map((msg) => this.chatService.toMessageResponse(msg)),
    );
    return {
      data: { messages: mappedMessages },
      statusCode: HttpStatus.OK,
    };
  }
}
