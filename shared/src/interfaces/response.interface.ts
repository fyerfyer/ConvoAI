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
  createdAt: string;
  updatedAt: string;
}

export interface GuildListResponse {
  guilds: GuildResponse[];
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
  user?: IUserPublic; // Optional expanded user
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

export interface EmbedResponse {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  image?: { url: string };
  thumbnail?: { url: string };
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
