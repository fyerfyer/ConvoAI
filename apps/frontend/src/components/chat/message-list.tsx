'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Hash } from 'lucide-react';
import MessageItem from './message-item';
import { MessageResponse } from '@discord-platform/shared';

interface MessageListProps {
  messages: MessageResponse[];
  channelName: string;
  isLoading: boolean;
  currentUserId?: string;
  hasOlderMessages?: boolean;
  onLoadMore?: () => void;
}

export default function MessageList({
  messages,
  channelName,
  isLoading,
  currentUserId,
  hasOlderMessages = false,
  onLoadMore,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // On initial load, scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.scrollTop === 0 && hasOlderMessages && onLoadMore) {
        onLoadMore();
      }
    },
    [hasOlderMessages, onLoadMore],
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col justify-end p-4 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-gray-600 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-gray-600 rounded" />
              <div className="h-3 w-64 bg-gray-600 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-end justify-center pb-8">
        <div className="text-center">
          <div className="mb-4 mx-auto h-16 w-16 rounded-full bg-gray-600 flex items-center justify-center">
            <Hash className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-1">
            Welcome to #{channelName}
          </h3>
          <p className="text-gray-400 text-sm">
            This is the start of the #{channelName} channel. Send a message to
            get the conversation going!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto"
      onScroll={handleScroll}
    >
      <div className="min-h-full flex flex-col justify-end">
        {/* Channel beginning indicator */}
        {!hasOlderMessages && (
          <div className="px-4 pt-8 pb-4">
            <div className="mb-2 h-16 w-16 rounded-full bg-gray-600 flex items-center justify-center">
              <Hash className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">
              Welcome to #{channelName}
            </h3>
            <p className="text-gray-400 text-sm">
              This is the beginning of the #{channelName} channel.
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="pb-4">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              currentUserId={currentUserId}
            />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
