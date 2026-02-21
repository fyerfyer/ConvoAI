'use client';

import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  Signal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoice } from '@/hooks/use-voice';
import { useVoiceStore } from '@/stores/voice-store';
import { cn } from '@/lib/utils';

interface VoiceStatusBarProps {
  channelName?: string;
}

export default function VoiceStatusBar({ channelName }: VoiceStatusBarProps) {
  const { leaveVoiceChannel, toggleMute, toggleDeafen } = useVoice();
  const { activeChannelId, isMuted, isDeafened, isConnecting } =
    useVoiceStore();

  if (!activeChannelId) return null;

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-3 py-2">
      {/* Connection status */}
      <div className="flex items-center gap-2 mb-2">
        <Signal
          className={cn(
            'h-4 w-4',
            isConnecting ? 'text-yellow-400 animate-pulse' : 'text-green-400',
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-green-400">
            {isConnecting ? 'Connecting...' : 'Voice Connected'}
          </p>
          {channelName && (
            <p className="text-[11px] text-gray-400 truncate">{channelName}</p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 rounded-md',
            isMuted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-700',
          )}
          onClick={toggleMute}
        >
          {isMuted ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 rounded-md',
            isDeafened
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-700',
          )}
          onClick={toggleDeafen}
        >
          {isDeafened ? (
            <HeadphoneOff className="h-4 w-4" />
          ) : (
            <Headphones className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/20 ml-auto"
          onClick={leaveVoiceChannel}
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
