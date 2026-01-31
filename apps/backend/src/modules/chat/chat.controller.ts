import { Controller, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';

@Controller('channels/:channelId/messages')
@UseGuards(JwtGuard)
export class ChatController {}
