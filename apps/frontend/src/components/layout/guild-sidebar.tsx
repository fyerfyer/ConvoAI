'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Home, Plus } from 'lucide-react';
import UserSection from './user-section';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '../ui/separator';
import { useGuilds } from '@/hooks/use-guild';
import { useGuildStore } from '@/stores/guild-store';
import CreateGuildDialog from '@/components/guild/create-guild-dialog';
import { cn } from '@/lib/utils';

export default function GuildSidebar() {
  const router = useRouter();
  const params = useParams<{ guildId?: string }>();
  const { data: guilds, isLoading } = useGuilds();
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const [createGuildOpen, setCreateGuildOpen] = useState(false);

  const activeGuildId = params?.guildId;

  const handleGuildClick = (guild: {
    id: string;
    name: string;
    icon?: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
  }) => {
    setActiveGuild(guild);
    router.push(`/app/guilds/${guild.id}`);
  };

  const handleHomeClick = () => {
    setActiveGuild(null);
    router.push('/app');
  };

  return (
    <>
      <div className="flex w-20 flex-col items-center bg-gray-900 py-3">
        {/* Home Button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'mb-2 h-12 w-12 rounded-2xl hover:rounded-xl transition-all bg-gray-700 hover:bg-indigo-500',
            !activeGuildId && 'rounded-xl bg-indigo-500',
          )}
          title="Home"
          onClick={handleHomeClick}
        >
          <Home className="h-6 w-6 text-white" />
        </Button>

        <Separator className="mb-2 w-8 bg-gray-700" />

        {/* Guild List */}
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center space-y-2 px-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 w-12 rounded-2xl bg-gray-700 animate-pulse"
                  />
                ))}
              </div>
            ) : !guilds || guilds.length === 0 ? (
              <div className="text-center text-xs text-gray-500 px-2 py-4">
                No guilds yet
              </div>
            ) : (
              guilds.map((guild) => (
                <Button
                  key={guild.id}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-12 w-12 rounded-2xl hover:rounded-xl transition-all bg-gray-700 hover:bg-gray-600',
                    activeGuildId === guild.id &&
                      'rounded-xl bg-indigo-500 hover:bg-indigo-600',
                  )}
                  title={guild.name}
                  onClick={() => handleGuildClick(guild)}
                >
                  {guild.icon ? (
                    <img
                      src={guild.icon}
                      alt={guild.name}
                      className="h-full w-full rounded-[inherit] object-cover"
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
          onClick={() => setCreateGuildOpen(true)}
        >
          <Plus className="h-6 w-6 text-green-400 hover:text-white" />
        </Button>

        {/* User Section at bottom */}
        <UserSection />
      </div>

      <CreateGuildDialog
        open={createGuildOpen}
        onOpenChange={setCreateGuildOpen}
      />
    </>
  );
}
