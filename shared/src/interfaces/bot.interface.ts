import { AgentEventType } from '../constants/bot.constant';

export interface AgentContextMessage {
  role: 'user' | 'assistant';
  content: string;
  author: string;
  messageId: string;
  timestamp: string;
}

export interface AgentPayload {
  event: AgentEventType;
  botId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  author: {
    id: string;
    name: string;
    avatar: string | null;
  };
  content: string;
  context: AgentContextMessage[];
  webhookCallbackUrl: string;
}

export interface AgentResponse {
  content: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string; icon_url?: string };
    timestamp?: string;
  }>;
}

export interface AgentStreamChunk {
  content: string;
  done?: boolean;
}

export interface BotStreamChunkPayload {
  botId: string;
  channelId: string;
  content: string;
  done: boolean;
}

export interface BotStreamStartPayload {
  botId: string;
  channelId: string;
  streamId: string;
}
