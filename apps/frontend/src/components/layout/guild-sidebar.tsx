'use client';

import { Home, Plus } from 'lucide-react';
import UserSection from './user-section';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '../ui/separator';

export default function GuildSidebar() {
  // TODO: Guild 相关逻辑
  const guilds: any[] = [];

  return (
    <div className="flex w-20 flex-col items-center bg-gray-900 py-3">
      {/* Home Button */}
      <Button
        variant="ghost"
        size="icon"
        className="mb-2 h-12 w-12 rounded-2xl hover:rounded-xl transition-all bg-gray-700 hover:bg-indigo-500"
        title="Home"
      >
        <Home className="h-6 w-6 text-white" />
      </Button>

      <Separator className="mb-2 w-8 bg-gray-700" />

      {/* Guild List */}
      <ScrollArea className="flex-1 w-full">
        <div className="flex flex-col items-center space-y-2 px-2">
          {guilds.length === 0 ? (
            <div className="text-center text-xs text-gray-500 px-2 py-4">
              No guilds yet
            </div>
          ) : (
            guilds.map((guild) => (
              <Button
                key={guild.id}
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-2xl hover:rounded-xl transition-all bg-gray-700 hover:bg-gray-600"
                title={guild.name}
              >
                {guild.icon ? (
                  <img
                    src={guild.icon}
                    alt={guild.name}
                    className="h-full w-full rounded-inherit object-cover"
                  />
                ) : (
                  <span className="text-white font-semibold">
                    {guild.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </Button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Add Guild Button */}
      <Separator className="mt-2 mb-2 w-8 bg-gray-700" />
      <Button
        variant="ghost"
        size="icon"
        className="mb-2 h-12 w-12 rounded-2xl hover:rounded-xl transition-all bg-gray-700 hover:bg-green-500"
        title="Add a Guild"
      >
        <Plus className="h-6 w-6 text-green-400 hover:text-white" />
      </Button>

      {/* User Section at bottom */}
      <UserSection />
    </div>
  );
}
