'use client';

import { Pin, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import MessageItem from './message-item';
import { usePinnedMessages, useUnpinMessage } from '@/hooks/use-chat';
import { toast } from '@/hooks/use-toast';

interface PinnedMessagesPanelProps {
  channelId: string;
  channelName: string;
  currentUserId?: string;
  canManageMessages: boolean;
  onClose: () => void;
}

export default function PinnedMessagesPanel({
  channelId,
  channelName,
  currentUserId,
  canManageMessages,
  onClose,
}: PinnedMessagesPanelProps) {
  const { data, isLoading } = usePinnedMessages(channelId);
  const unpinMutation = useUnpinMessage();
  const messages = data?.messages ?? [];

  const handleUnpin = (messageId: string) => {
    unpinMutation.mutate(
      { channelId, messageId },
      {
        onSuccess: () => {
          toast({ title: 'Message unpinned' });
        },
        onError: (err) => {
          toast({
            title: 'Failed to unpin',
            description:
              (err as { message?: string }).message ?? 'Unknown error',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full w-80 bg-gray-800 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Pin className="h-4 w-4 text-yellow-400" />
          <h3 className="font-semibold text-white text-sm">Pinned Messages</h3>
          {data && (
            <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded-full">
              {data.count}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 hover:text-white"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Pin className="h-10 w-10 text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">
              No pinned messages in #{channelName}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Pin important messages so they&apos;re easy to find later.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {messages.map((message) => (
              <div key={message.id} className="relative group/pin">
                <MessageItem message={message} currentUserId={currentUserId} />
                {canManageMessages && (
                  <button
                    onClick={() => handleUnpin(message.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover/pin:opacity-100 transition-opacity
                      bg-gray-900/80 hover:bg-red-600/80 text-gray-300 hover:text-white
                      rounded p-1 text-xs"
                    title="Unpin message"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
