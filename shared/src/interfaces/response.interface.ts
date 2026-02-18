import { ChannelValue } from '../constants/channel.contant';
import { AttachmentValue } from '../constants/chat.constant';
import { IUserPublic, IUserSummary } from './user.interface';

export interface AuthResponse {
  user: IUserPublic;
  token: string;
}

export interface UserResponse {
  user: IUserPublic;
}

// Guild Responses
export interface GuildResponse {
  id: string;
  name: string;
  icon?: string;
  ownerId: string;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuildListResponse {
  guilds: GuildResponse[];
}

export interface GuildSearchResponse {
  guilds: GuildResponse[];
  total: number;
}

export interface InviteResponse {
  code: string;
  guild: GuildResponse;
  inviter: { id: string; name: string };
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface InviteListResponse {
  invites: InviteResponse[];
}

export interface ChannelResponse {
  id: string;
  name: string;
  type: ChannelValue;
  guildId: string;
  position: number;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelListResponse {
  channels: ChannelResponse[];
}

export interface MemberResponse {
  id: string;
  userId: string;
  guildId: string;
  roles: string[];
  nickname?: string;
  joinedAt: string;
  user?: IUserPublic;
}

export interface MemberListResponse {
  members: MemberResponse[];
}

export interface MediaResponse {
  url: string;
  key: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface AttachmentResponse {
  type: AttachmentValue;
  url: string;
  filename: string;
  size: number;
}

export interface EmbedFieldResponse {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedFooterResponse {
  text: string;
  icon_url?: string;
}

export interface EmbedResponse {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  image?: { url: string };
  thumbnail?: { url: string };
  fields?: EmbedFieldResponse[];
  footer?: EmbedFooterResponse;
  timestamp?: string;
}

export interface MessageResponse {
  id: string;
  content: string;
  channelId: string;
  author: IUserSummary;
  attachments?: AttachmentResponse[];
  embeds?: EmbedResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageListResponse {
  messages: MessageResponse[];
}

export interface BotResponse {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  guildId: string;
  type: string;
  executionMode: string;
  webhookUrl?: string;
  webhookToken?: string;
  description: string;
  status: string;
  templateId?: string;
  templateConfig?: Record<string, unknown>;
  llmConfig?: {
    provider: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    tools?: string[];
    customBaseUrl?: string;
    // apiKey 永远不返回给前端
  };
  createdAt: string;
  updatedAt: string;
}

export interface BotListResponse {
  bots: BotResponse[];
}
