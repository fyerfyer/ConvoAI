'use client';

import { Hash, Volume2, Settings } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

export default function ChannelSidebar() {
  // TODO: channels 相关逻辑
  const guildName = 'Welcome Server';
  const textChannels = [
    { id: '1', name: 'general' },
    { id: '2', name: 'announcements' },
  ];
  const voiceChannels = [{ id: '3', name: 'General Voice' }];

  return (
    <div className="flex w-60 flex-col bg-gray-800 text-gray-100">
      {/* Guild Name Header */}
      <div className="flex h-12 items-center justify-between px-4 shadow-md">
        <h2 className="font-semibold">{guildName}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="bg-gray-700" />

      {/* Channels List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {/* Text Channels */}
          <div>
            <div className="mb-2 flex items-center px-2 text-xs font-semibold uppercase text-gray-400">
              Text Channels
            </div>
            <div className="space-y-0.5">
              {textChannels.map((channel) => (
                <Button
                  key={channel.id}
                  variant="ghost"
                  className="w-full justify-start px-2 py-1 h-8 text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  <Hash className="mr-2 h-4 w-4" />
                  {channel.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Voice Channels */}
          <div>
            <div className="mb-2 flex items-center px-2 text-xs font-semibold uppercase text-gray-400">
              Voice Channels
            </div>
            <div className="space-y-0.5">
              {voiceChannels.map((channel) => (
                <Button
                  key={channel.id}
                  variant="ghost"
                  className="w-full justify-start px-2 py-1 h-8 text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  <Volume2 className="mr-2 h-4 w-4" />
                  {channel.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
