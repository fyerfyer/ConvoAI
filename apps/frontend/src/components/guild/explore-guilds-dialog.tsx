'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, ArrowRight, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useSearchGuilds,
  useJoinGuild,
  useJoinViaInvite,
  useGuilds,
} from '@/hooks/use-guild';
import { useGuildStore } from '@/stores/guild-store';
import { toast } from '@/hooks/use-toast';
import { GuildResponse } from '@discord-platform/shared';

interface ExploreGuildsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ExploreGuildsDialog({
  open,
  onOpenChange,
}: ExploreGuildsDialogProps) {
  const router = useRouter();
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'invite'>('search');

  const { data: searchResults, isLoading: isSearching } =
    useSearchGuilds(searchQuery);
  const { data: myGuilds } = useGuilds();
  const joinGuildMutation = useJoinGuild();
  const joinViaMutation = useJoinViaInvite();

  const myGuildIds = new Set(myGuilds?.map((g) => g.id) ?? []);

  const handleJoin = useCallback(
    async (guild: GuildResponse) => {
      try {
        await joinGuildMutation.mutateAsync(guild.id);
        toast({
          title: 'Joined Guild',
          description: `You are now a member of ${guild.name}`,
        });
        setActiveGuild(guild);
        onOpenChange(false);
        router.push(`/app/guilds/${guild.id}`);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Failed to join guild';
        toast({
          variant: 'destructive',
          title: 'Join Failed',
          description: message,
        });
      }
    },
    [joinGuildMutation, setActiveGuild, onOpenChange, router],
  );

  const handleJoinViaInvite = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) return;

    // Extract code from full URL if pasted
    const match = code.match(/(?:invite\/)?([a-zA-Z0-9]+)$/);
    const resolvedCode = match ? match[1] : code;

    try {
      const guild = await joinViaMutation.mutateAsync(resolvedCode);
      toast({
        title: 'Joined Guild',
        description: guild
          ? `You are now a member of ${guild.name}`
          : 'Joined successfully!',
      });
      if (guild) {
        setActiveGuild(guild);
        router.push(`/app/guilds/${guild.id}`);
      }
      setInviteCode('');
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Invalid or expired invite';
      toast({
        variant: 'destructive',
        title: 'Join Failed',
        description: message,
      });
    }
  }, [inviteCode, joinViaMutation, setActiveGuild, onOpenChange, router]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSearchQuery('');
      setInviteCode('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-gray-800 text-white border-gray-700 p-0 gap-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl">
            {activeTab === 'search'
              ? 'Explore Guilds'
              : 'Join with Invite Link'}
          </DialogTitle>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex gap-1 px-6 pt-4">
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'search'
                ? 'bg-indigo-500 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            onClick={() => setActiveTab('search')}
          >
            <Search className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
            Search Guilds
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'invite'
                ? 'bg-indigo-500 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            onClick={() => setActiveTab('invite')}
          >
            <Link2 className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
            Have an Invite?
          </button>
        </div>

        {activeTab === 'search' ? (
          <div className="p-6 pt-4 space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for guilds..."
                className="pl-10 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              />
            </div>

            {/* Results */}
            <ScrollArea className="h-[320px]">
              {isSearching && searchQuery ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 animate-pulse"
                    >
                      <div className="h-12 w-12 rounded-2xl bg-gray-700 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-32 bg-gray-700 rounded" />
                        <div className="h-2 w-20 bg-gray-700 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchResults && searchResults.guilds.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.guilds.map((guild) => {
                    const isMember = myGuildIds.has(guild.id);
                    return (
                      <div
                        key={guild.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700/50 transition-colors"
                      >
                        <Avatar className="h-12 w-12 rounded-2xl shrink-0">
                          <AvatarImage
                            src={guild.icon || undefined}
                            className="rounded-2xl"
                          />
                          <AvatarFallback className="rounded-2xl bg-indigo-500 text-white text-lg font-semibold">
                            {guild.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {guild.name}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Users className="h-3 w-3" />
                            <span>
                              {guild.memberCount ?? '?'} member
                              {guild.memberCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        {isMember ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-400 hover:text-green-300 hover:bg-green-500/10 text-xs"
                            onClick={() => {
                              setActiveGuild(guild);
                              onOpenChange(false);
                              router.push(`/app/guilds/${guild.id}`);
                            }}
                          >
                            Joined
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-indigo-500 hover:bg-indigo-600 text-xs"
                            onClick={() => handleJoin(guild)}
                            disabled={joinGuildMutation.isPending}
                          >
                            {joinGuildMutation.isPending
                              ? 'Joining...'
                              : 'Join'}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {searchResults.total > searchResults.guilds.length && (
                    <p className="text-center text-xs text-gray-500 pt-2">
                      Showing {searchResults.guilds.length} of{' '}
                      {searchResults.total} results
                    </p>
                  )}
                </div>
              ) : searchQuery ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                  <Search className="h-12 w-12 mb-3 text-gray-600" />
                  <p className="text-sm">No guilds found</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                  <Search className="h-12 w-12 mb-3 text-gray-600" />
                  <p className="text-sm">Search for guilds to explore</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Type a guild name to get started
                  </p>
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="p-6 pt-4 space-y-4">
            <p className="text-sm text-gray-400">
              Enter an invite link or code below to join an existing guild.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-gray-400">
                Invite Link or Code
              </label>
              <Input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="https://discord.gg/hTKzmak or hTKzmak"
                className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoinViaInvite();
                }}
              />
              <p className="text-[11px] text-gray-500">
                Invites should look like: hTKzmak or https://discord.gg/hTKzmak
              </p>
            </div>

            <Button
              onClick={handleJoinViaInvite}
              disabled={!inviteCode.trim() || joinViaMutation.isPending}
              className="w-full bg-indigo-500 hover:bg-indigo-600"
            >
              {joinViaMutation.isPending ? 'Joining...' : 'Join Guild'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
