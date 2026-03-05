'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Home, Plus, Compass } from 'lucide-react';
import UserSection from './user-section';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '../ui/separator';
import { useGuilds } from '@/hooks/use-guild';
import { useGuildStore } from '@/stores/guild-store';
import CreateGuildDialog from '@/components/guild/create-guild-dialog';
import ExploreGuildsDialog from '@/components/guild/explore-guilds-dialog';
import { cn } from '@/lib/utils';
import { useAllGuildsUnread, useGuildUnread } from '@/hooks/use-unread';

export default function GuildSidebar() {
  const router = useRouter();
  const params = useParams<{ guildId?: string }>();
  const { data: guilds, isLoading } = useGuilds();
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const [createGuildOpen, setCreateGuildOpen] = useState(false);
  const [exploreGuildsOpen, setExploreGuildsOpen] = useState(false);

  const activeGuildId = params?.guildId;

  // Fetch unread for all guilds the user belongs to
  useAllGuildsUnread(guilds);

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
                <GuildIconWithBadge
                  key={guild.id}
                  guild={guild}
                  isActive={activeGuildId === guild.id}
                  onClick={() => handleGuildClick(guild)}
                />
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

        {/* Explore Guilds Button */}
        <Button
          variant="ghost"
          size="icon"
          className="mb-2 h-12 w-12 rounded-2xl hover:rounded-xl transition-all bg-gray-700 hover:bg-green-500"
          title="Explore Guilds"
          onClick={() => setExploreGuildsOpen(true)}
        >
          <Compass className="h-6 w-6 text-green-400 hover:text-white" />
        </Button>

        {/* User Section at bottom */}
        <UserSection />
      </div>

      <CreateGuildDialog
        open={createGuildOpen}
        onOpenChange={setCreateGuildOpen}
      />
      <ExploreGuildsDialog
        open={exploreGuildsOpen}
        onOpenChange={setExploreGuildsOpen}
      />
    </>
  );
}

/**
 * Guild icon that shows unread indicators (bar + badge) when
 * any channel in the guild has unread messages.
 * Uses the TanStack Query cache to read guild-scoped unread data.
 */
function GuildIconWithBadge({
  guild,
  isActive,
  onClick,
}: {
  guild: {
    id: string;
    name: string;
    icon?: string;
  };
  isActive: boolean;
  onClick: () => void;
}) {
  const { data: cachedData } = useGuildUnread(guild.id);
  const guildHasUnread = (cachedData ?? []).some((ch) => ch.count > 0);

  return (
    <div className="relative group">
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute -left-2 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-full bg-white" />
      )}
      {/* Unread indicator bar (when not active) */}
      {!isActive && guildHasUnread && (
        <span className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all group-hover:h-5" />
      )}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-12 w-12 rounded-2xl hover:rounded-xl transition-all bg-gray-700 hover:bg-gray-600',
          isActive && 'rounded-xl bg-indigo-500 hover:bg-indigo-600',
        )}
        title={guild.name}
        onClick={onClick}
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
      {/* Unread count badge */}
      {!isActive && guildHasUnread && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white ring-2 ring-gray-900">
          !
        </span>
      )}
    </div>
  );
}
