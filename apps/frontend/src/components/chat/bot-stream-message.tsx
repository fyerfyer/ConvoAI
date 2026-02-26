'use client';

import { useMemo } from 'react';
import { Bot, Sparkles } from 'lucide-react';
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
          className="group flex items-start py-2 pl-4 pr-12 bg-blue-500/5 border-l-2 border-blue-400/60 mt-0.5 animate-in fade-in-0 duration-300"
        >
          <Avatar className="h-10 w-10 mr-4 shrink-0 mt-0.5 ring-2 ring-blue-500/30">
            <AvatarFallback className="bg-blue-600 text-white">
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-blue-400">Agent</span>
              <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
                <Sparkles className="h-2.5 w-2.5" />
                Bot
              </span>
              {stream.content ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
                  </span>
                  Streaming
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                  <ThinkingDots />
                  Thinking
                </span>
              )}
            </div>
            <div className="text-sm text-gray-200 break-words whitespace-pre-wrap mt-1">
              {stream.content ? (
                <>
                  {stream.content}
                  <span className="inline-block w-0.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle rounded-full" />
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div
                      className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <div
                      className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <div
                      className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs italic">
                    Generating response...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5 items-center">
      <span
        className="h-1 w-1 rounded-full bg-purple-400 animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="h-1 w-1 rounded-full bg-purple-400 animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="h-1 w-1 rounded-full bg-purple-400 animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  );
}
