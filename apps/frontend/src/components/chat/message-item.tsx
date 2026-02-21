'use client';

import { useMemo } from 'react';
import { Download, FileIcon, Play, Bot, Reply, Mic } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import EmbedRenderer from './embed-renderer';
import MessageContent from './message-content';
import AudioPlayer from './audio-player';
import SystemMessage from './system-message';
import { MessageResponse, MESSAGE_TYPE } from '@discord-platform/shared';
import { cn } from '@/lib/utils';

interface MessageItemProps {
  message: MessageResponse;
  currentUserId?: string;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString()} ${time}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function MessageItem({
  message,
  currentUserId,
}: MessageItemProps) {
  const timestamp = useMemo(
    () => formatTimestamp(message.createdAt),
    [message.createdAt],
  );
  const isOwnMessage = !!currentUserId && message.author.id === currentUserId;
  const authorDisplayName = message.author.nickname || message.author.name;
  const isVoiceMessage = message.type === MESSAGE_TYPE.VOICE;

  // Handle system messages
  if (message.type === MESSAGE_TYPE.SYSTEM) {
    return <SystemMessage message={message} />;
  }

  return (
    <div
      className={cn(
        'group flex items-start py-2 pl-4 pr-12 hover:bg-gray-800/30 mt-4 first:mt-0',
        isOwnMessage &&
          'bg-indigo-500/10 hover:bg-indigo-500/15 border-l-2 border-indigo-400',
        isVoiceMessage && 'bg-green-500/5',
      )}
    >
      <Avatar className="h-10 w-10 mr-4 shrink-0 mt-0.5">
        <AvatarImage src={message.author.avatar || undefined} />
        <AvatarFallback
          className={cn(
            'text-white text-sm',
            message.author.isBot ? 'bg-blue-600' : 'bg-indigo-500',
          )}
        >
          {message.author.isBot ? (
            <Bot className="h-5 w-5" />
          ) : (
            getInitials(authorDisplayName)
          )}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        {/* Reply context */}
        {message.replyTo && (
          <div className="flex items-center gap-1.5 mb-1 text-xs text-gray-400">
            <Reply className="h-3 w-3 rotate-180" />
            <span className="font-medium text-gray-300">
              {message.replyTo.author?.name || 'Unknown'}
            </span>
            <span className="truncate max-w-[300px] text-gray-500">
              {message.replyTo.content}
            </span>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'text-sm font-semibold',
              message.author.isBot
                ? 'text-blue-400'
                : isOwnMessage
                  ? 'text-indigo-200'
                  : 'text-white',
            )}
          >
            {authorDisplayName}
          </span>
          {message.author.isBot && (
            <span className="rounded bg-blue-500 px-1 py-0.5 text-[10px] font-bold text-white uppercase">
              Bot
            </span>
          )}
          {isVoiceMessage && (
            <span className="flex items-center gap-1 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-green-300 uppercase">
              <Mic className="h-2.5 w-2.5" />
              Voice
            </span>
          )}
          <span className="text-[11px] text-gray-500">{timestamp}</span>
        </div>

        {/* Message content - use markdown renderer */}
        {message.content && <MessageContent content={message.content} />}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-1 space-y-1">
            {message.attachments.map((att, idx) => (
              <AttachmentPreview key={idx} attachment={att} />
            ))}
          </div>
        )}

        {/* Embeds */}
        {message.embeds && message.embeds.length > 0 && (
          <div className="mt-1 space-y-1">
            {message.embeds.map((embed, idx) => (
              <EmbedRenderer key={idx} embed={embed} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AttachmentPreviewProps {
  attachment: NonNullable<MessageResponse['attachments']>[number];
}

function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Audio attachment - use custom AudioPlayer
  if (attachment.type === 'audio') {
    return (
      <AudioPlayer
        url={attachment.url}
        duration={attachment.duration}
        filename={attachment.filename}
      />
    );
  }

  if (attachment.type === 'image') {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="max-w-sm max-h-80 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
        />
      </a>
    );
  }

  if (attachment.type === 'video') {
    return (
      <div className="max-w-lg rounded-lg overflow-hidden bg-gray-900">
        <video
          src={attachment.url}
          controls
          preload="metadata"
          className="max-w-full max-h-80"
        >
          <source src={attachment.url} />
        </video>
        <div className="px-3 py-1.5 flex items-center gap-2">
          <Play className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-400 truncate">
            {attachment.filename}
          </span>
          <span className="text-xs text-gray-500 ml-auto shrink-0">
            {formatSize(attachment.size)}
          </span>
        </div>
      </div>
    );
  }

  // Generic file
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-800 border border-gray-700 p-3 max-w-sm hover:bg-gray-750 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
        <FileIcon className="h-5 w-5 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 truncate hover:underline block"
        >
          {attachment.filename}
        </a>
        <p className="text-xs text-gray-500">{formatSize(attachment.size)}</p>
      </div>
      <a
        href={attachment.url}
        download={attachment.filename}
        className="h-8 w-8 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors shrink-0"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}
