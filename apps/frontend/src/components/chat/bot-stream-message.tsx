'use client';

import { useMemo } from 'react';
import { Bot } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useBotStreamStore } from '@/stores/bot-stream-store';

interface BotStreamMessageProps {
  channelId: string;
}

export default function BotStreamMessage({ channelId }: BotStreamMessageProps) {
  const activeStreams = useBotStreamStore((s) => s.activeStreams);

  const channelStreams = useMemo(() => {
    return Object.entries(activeStreams)
      .filter(([, s]) => s.channelId === channelId)
      .map(([streamId, s]) => ({
        streamId,
        botId: s.botId,
        content: s.content,
        startedAt: s.startedAt,
      }));
  }, [activeStreams, channelId]);

  if (channelStreams.length === 0) return null;

  return (
    <>
      {channelStreams.map((stream) => (
        <div
          key={stream.streamId}
          className="group flex items-start py-2 pl-4 pr-12 bg-purple-500/5 border-l-2 border-purple-400 mt-4"
        >
          <Avatar className="h-10 w-10 mr-4 shrink-0 mt-0.5">
            <AvatarFallback className="bg-purple-600 text-white">
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-purple-300">
                Agent
              </span>
              <span className="rounded bg-purple-500 px-1 py-0.5 text-[10px] font-bold text-white uppercase">
                Streaming
              </span>
              <span className="text-[11px] text-gray-500">
                <TypingDots />
              </span>
            </div>
            <div className="text-sm text-gray-200 break-words whitespace-pre-wrap mt-0.5">
              {stream.content || (
                <span className="text-gray-400 italic">Thinking...</span>
              )}
              <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-middle rounded-sm" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
        .
      </span>
      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
        .
      </span>
      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
        .
      </span>
    </span>
  );
}
