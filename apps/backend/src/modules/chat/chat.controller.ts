import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/permission.decorator';
import { ChatService } from './chat.service';
import {
  ApiResponse,
  AttachmentPresignedUrlDTO,
  attachmentPresignedUrlDTOSchema,
  CreateMessageDTO,
  createMessageDTOSchema,
  JwtPayload,
  MessageListResponse,
  MessageResponse,
  PERMISSIONS,
} from '@discord-platform/shared';
import { User } from '../../common/decorators/user.decorator';
import { ZodValidationPipe } from '../../common/pipes/validation.pipe';

@Controller('channels/:channelId/messages')
@UseGuards(JwtGuard, PermissionGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 30, ttl: 10000 },
  })
  @Post()
  @RequirePermissions(PERMISSIONS.SEND_MESSAGES)
  async createMessage(
    @User() user: JwtPayload,
    @Body(new ZodValidationPipe(createMessageDTOSchema))
    createMessageDTO: CreateMessageDTO,
  ): Promise<ApiResponse<MessageResponse>> {
    const message = await this.chatService.createMessage(
      user.sub,
      createMessageDTO,
    );
    return {
      data: (await this.chatService.toMessageResponse(
        message,
      )) as MessageResponse,
      statusCode: HttpStatus.CREATED,
      message: 'Message sent successfully',
    };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_CHANNELS)
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
      data: { messages: mappedMessages as MessageResponse[] },
      statusCode: HttpStatus.OK,
    };
  }

  @Throttle({
    short: { limit: 1, ttl: 1000 },
    long: { limit: 10, ttl: 60000 },
  })
  @Post('attachments/presign')
  @RequirePermissions(PERMISSIONS.SEND_MESSAGES)
  async getAttachmentPresignedUrl(
    @User() user: JwtPayload,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(attachmentPresignedUrlDTOSchema))
    dto: AttachmentPresignedUrlDTO,
  ): Promise<ApiResponse<{ uploadUrl: string; fileUrl: string; key: string }>> {
    const result = await this.chatService.getAttachmentPresignedUrl(
      user.sub,
      channelId,
      dto,
    );
    return {
      data: result,
      statusCode: HttpStatus.OK,
      message: 'Presigned URL generated',
    };
  }
}
