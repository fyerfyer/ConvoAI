import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { Bot, botSchema } from './schemas/bot.schema';
import { ChannelBot, channelBotSchema } from './schemas/channel-bot.schema';
import { User, userSchema } from '../user/schemas/user.schema';
import { Guild, guildSchema } from '../guild/schemas/guild.schema';
import { Channel, channelSchema } from '../channel/schemas/channel.schema';
import { Member, memberSchema } from '../member/schemas/member.schema';
import { BotService } from './bot.service';
import { ChannelBotService } from './channel-bot.service';
import { BotController } from './bot.controller';
import { BotOrchestratorService } from './bot-orchestrator.service';
import { WebhookController } from './webhook.controller';
import { WebhookGuard } from './webhook.guard';
import { ChatModule } from '../chat/chat.module';
import { MemoryModule } from '../memory/memory.module';

import { AgentRunner } from './runners/agent-runner.service';
import { WebhookRunner } from './runners/webhook-runner.service';
import { BuiltinRunner } from './runners/builtin-runner.service';
import { LlmRunner } from './runners/llm-runner.service';

import { TemplateRegistry } from './templates/template-registry';
import { ToolExecutorService } from './tools/tool-executor.service';
import { ContextBuilder } from './context/context-builder.service';

import { EncryptionService } from './crypto/encryption.service';

import { BotStreamProducer } from './bot-stream.producer';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Bot.name, schema: botSchema },
      { name: ChannelBot.name, schema: channelBotSchema },
      { name: User.name, schema: userSchema },
      { name: Guild.name, schema: guildSchema },
      { name: Channel.name, schema: channelSchema },
      { name: Member.name, schema: memberSchema },
    ]),
    HttpModule.register({
      timeout: 120_000,
      maxRedirects: 3,
    }),
    ChatModule,
    MemoryModule,
  ],
  providers: [
    BotService,
    ChannelBotService,
    BotOrchestratorService,
    WebhookGuard,
    EncryptionService,

    TemplateRegistry,
    ToolExecutorService,
    ContextBuilder,

    AgentRunner,
    WebhookRunner,
    BuiltinRunner,
    LlmRunner,

    BotStreamProducer,
  ],
  controllers: [BotController, WebhookController],
  exports: [
    BotService,
    ChannelBotService,
    BotOrchestratorService,
    TemplateRegistry,
  ],
})
export class BotModule {}
