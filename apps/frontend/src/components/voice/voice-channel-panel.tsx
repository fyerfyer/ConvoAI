'use client';

import { useCallback } from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useVoice } from '@/hooks/use-voice';
import { useVoiceStore } from '@/stores/voice-store';
import { cn } from '@/lib/utils';

interface VoiceChannelPanelProps {
  channelId: string;
  channelName: string;
  guildId: string;
}

export default function VoiceChannelPanel({
  channelId,
  channelName,
  guildId,
}: VoiceChannelPanelProps) {
  const { joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen } =
    useVoice();
  const { activeChannelId, participants, isMuted, isDeafened, isConnecting } =
    useVoiceStore();

  const isInThisChannel = activeChannelId === channelId;
  const isInAnyChannel = !!activeChannelId;

  const handleJoin = useCallback(async () => {
    try {
      await joinVoiceChannel(channelId, guildId);
    } catch (error) {
      console.error('Failed to join voice channel:', error);
    }
  }, [channelId, guildId, joinVoiceChannel]);

  const handleLeave = useCallback(() => {
    leaveVoiceChannel();
  }, [leaveVoiceChannel]);

  return (
    <div className="flex flex-col">
      {/* Voice channel header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-semibold text-white">
            {channelName}
          </span>
        </div>

        {!isInThisChannel ? (
          <Button
            size="sm"
            variant="default"
            className="bg-green-600 hover:bg-green-700 text-white text-xs"
            onClick={handleJoin}
            disabled={isConnecting || isInAnyChannel}
          >
            {isConnecting ? (
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Connecting...
              </div>
            ) : isInAnyChannel ? (
              'In another channel'
            ) : (
              'Join Voice'
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="text-xs"
            onClick={handleLeave}
          >
            <PhoneOff className="h-3.5 w-3.5 mr-1" />
            Disconnect
          </Button>
        )}
      </div>

      {/* Connected participants */}
      {isInThisChannel && (
        <>
          <div className="p-3 space-y-2">
            {participants.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-2">
                No one else is here
              </p>
            ) : (
              participants.map((participant) => (
                <div
                  key={participant.userId}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-800/50"
                >
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={participant.avatar || undefined} />
                      <AvatarFallback className="bg-indigo-500 text-white text-xs">
                        {participant.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {participant.isSpeaking && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-gray-900" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-sm truncate flex-1',
                      participant.isSpeaking
                        ? 'text-green-400 font-medium'
                        : 'text-gray-300',
                    )}
                  >
                    {participant.name}
                  </span>
                  {participant.isMuted && (
                    <MicOff className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Voice controls bar */}
          <div className="flex items-center justify-center gap-3 px-4 py-3 bg-gray-900 border-t border-gray-700">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-9 rounded-full',
                isMuted
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
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
                'h-9 w-9 rounded-full',
                isDeafened
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
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
              className="h-9 w-9 rounded-full bg-red-500 text-white hover:bg-red-600"
              onClick={handleLeave}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* Not connected - show empty state */}
      {!isInThisChannel && (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <Volume2 className="h-12 w-12 text-gray-600 mb-3" />
          <h3 className="text-lg font-semibold text-white mb-1">
            Voice Channel
          </h3>
          <p className="text-sm text-gray-400 max-w-[240px]">
            Join this voice channel to talk with other members
          </p>
        </div>
      )}
    </div>
  );
}
