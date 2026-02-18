import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { Bot, botSchema } from './schemas/bot.schema';
import { User, userSchema } from '../user/schemas/user.schema';
import { Guild, guildSchema } from '../guild/schemas/guild.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { BotOrchestratorService } from './bot-orchestrator.service';
import { WebhookController } from './webhook.controller';
import { WebhookGuard } from './webhook.guard';
import { ChatModule } from '../chat/chat.module';

import { AgentRunner } from './runners/agent-runner.service';
import { WebhookRunner } from './runners/webhook-runner.service';
import { BuiltinRunner } from './runners/builtin-runner.service';
import { LlmRunner } from './runners/llm-runner.service';

import { TemplateRegistry } from './templates/template-registry';

import { EncryptionService } from './crypto/encryption.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Bot.name, schema: botSchema },
      { name: User.name, schema: userSchema },
      { name: Guild.name, schema: guildSchema },
      { name: Channel.name, schema: channelSchema },
    ]),
    HttpModule.register({
      timeout: 120_000,
      maxRedirects: 3,
    }),
    ChatModule,
  ],
  providers: [
    BotService,
    BotOrchestratorService,
    WebhookGuard,
    EncryptionService,

    TemplateRegistry,

    AgentRunner,
    WebhookRunner,
    BuiltinRunner,
    LlmRunner,
  ],
  controllers: [BotController, WebhookController],
  exports: [BotService, BotOrchestratorService, TemplateRegistry],
})
export class BotModule {}
