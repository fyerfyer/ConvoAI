'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { Hash, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MessageList from './message-list';
import MessageInput from './message-input';
import { useMessages } from '@/hooks/use-chat';
import { useSocket } from '@/hooks/use-socket';
import { useChatStore } from '@/stores/chat-store';
import { useCurrentUser } from '@/hooks/use-auth';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useMembers } from '@/hooks/use-member';
import { MessageResponse, AttachmentDto } from '@discord-platform/shared';

interface ChatAreaProps {
  channelId: string;
  channelName: string;
  guildId: string;
  onToggleMembers?: () => void;
  showMemberToggle?: boolean;
}

export default function ChatArea({
  channelId,
  channelName,
  guildId,
  onToggleMembers,
  showMemberToggle = true,
}: ChatAreaProps) {
  const user = useCurrentUser();
  const { data: guildMembers = [] } = useMembers(guildId);
  const { data: fetchedMessages, isLoading } = useMessages(channelId);
  const {
    joinRoom,
    leaveRoom,
    sendMessage: socketSendMessage,
    sendTyping,
  } = useSocket();
  const { messagesByChannel, setMessages, setCurrentChannel, typingUsers } =
    useChatStore();
  const prevChannelRef = useRef<string | null>(null);
  const { uploadFiles, isUploading } = useFileUpload(channelId);

  // Sync fetched messages into store
  useEffect(() => {
    if (fetchedMessages && channelId) {
      setMessages(channelId, fetchedMessages);
    }
  }, [fetchedMessages, channelId, setMessages]);

  // Join/leave room when channel changes
  useEffect(() => {
    if (!channelId) return;

    // Leave previous room
    if (prevChannelRef.current && prevChannelRef.current !== channelId) {
      leaveRoom(prevChannelRef.current);
    }

    // Join new room
    joinRoom(channelId);
    setCurrentChannel(channelId);
    prevChannelRef.current = channelId;

    return () => {
      leaveRoom(channelId);
      setCurrentChannel(null);
    };
  }, [channelId, joinRoom, leaveRoom, setCurrentChannel]);

  // Get messages from store (includes real-time additions)
  const messages: MessageResponse[] = useMemo(() => {
    const stored = messagesByChannel[channelId] ?? [];
    const nicknameByUserId = new Map(
      guildMembers.map((member) => [member.userId, member.nickname]),
    );
    // Sort messages by createdAt ascending
    return [...stored]
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .map((message) => ({
        ...message,
        author: {
          ...message.author,
          nickname:
            nicknameByUserId.get(message.author.id) || message.author.nickname,
        },
      }));
  }, [messagesByChannel, channelId, guildMembers]);

  const currentTypingUsers =
    typingUsers[channelId]?.filter((id) => id !== user?.id) ?? [];

  const handleSendMessage = useCallback(
    (content: string, attachments?: AttachmentDto[]) => {
      if (!user) return;
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      socketSendMessage({
        channelId,
        content,
        nonce,
        attachments,
      });
    },
    [channelId, user, socketSendMessage],
  );

  const handleFilesSelected = useCallback(
    async (files: File[]): Promise<AttachmentDto[]> => {
      return uploadFiles(files);
    },
    [uploadFiles],
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      sendTyping(channelId, isTyping);
    },
    [channelId, sendTyping],
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-700">
      {/* Channel Header */}
      <div className="flex h-12 items-center justify-between px-4 shadow-md bg-gray-700 border-b border-gray-600">
        <div className="flex items-center">
          <Hash className="mr-2 h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-white">{channelName}</h3>
        </div>
        {showMemberToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white"
            onClick={onToggleMembers}
          >
            <Users className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        channelName={channelName}
        channelId={channelId}
        isLoading={isLoading}
        currentUserId={user?.id}
      />

      {/* Typing Indicator */}
      {currentTypingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-400">
          <span className="animate-pulse">
            {currentTypingUsers.length === 1
              ? 'Someone is typing...'
              : `${currentTypingUsers.length} people are typing...`}
          </span>
        </div>
      )}

      {/* Message Input */}
      <MessageInput
        channelName={channelName}
        guildId={guildId}
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        isUploading={isUploading}
        onFilesSelected={handleFilesSelected}
      />
    </div>
  );
}
