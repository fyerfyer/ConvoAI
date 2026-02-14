'use client';

import { useEffect, useState } from 'react';
import { AtSign, Crown, MoreVertical, UserMinus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MemberResponse, GuildResponse } from '@discord-platform/shared';
import { useKickMember } from '@/hooks/use-member';
import { useCurrentUser } from '@/hooks/use-auth';

interface MemberCardProps {
  member: MemberResponse;
  guild: GuildResponse;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function MemberCard({ member, guild }: MemberCardProps) {
  const currentUser = useCurrentUser();
  const kickMemberMutation = useKickMember();
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const displayName = member.nickname || member.user?.name || 'Unknown';
  const isOwner = guild.ownerId === member.userId;
  const isCurrentUser = currentUser?.id === member.userId;
  const canKick =
    guild.ownerId === currentUser?.id && !isCurrentUser && !isOwner;

  const handleKick = () => {
    kickMemberMutation.mutate(
      { guildId: guild.id, userId: member.userId },
      {
        onSuccess: () => setKickDialogOpen(false),
      },
    );
  };

  const handleMention = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('discord:mention-user', {
        detail: {
          displayName,
        },
      }),
    );
    setContextMenu(null);
  };

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('click', close);
    document.addEventListener('contextmenu', close);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  return (
    <>
      <div
        className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-700/50"
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <div className="relative">
          <Avatar className="h-8 w-8">
            <AvatarImage src={member.user?.avatar || undefined} />
            <AvatarFallback className="bg-indigo-500 text-white text-xs">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm text-gray-300 truncate">{displayName}</p>
            {isOwner && (
              <Crown className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            )}
          </div>
        </div>
        {/* Action menu */}
        {canKick && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="left"
              className="w-48 bg-gray-900 border-gray-700"
            >
              <DropdownMenuItem
                onClick={() => setKickDialogOpen(true)}
                className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <UserMinus className="mr-2 h-4 w-4" />
                <span>Kick {displayName}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[170px] rounded-md border border-gray-600 bg-gray-800 p-1 shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors"
            onClick={handleMention}
          >
            <AtSign className="h-4 w-4" />
            Mention
          </button>
          {canKick && (
            <button
              className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
              onClick={() => {
                setKickDialogOpen(true);
                setContextMenu(null);
              }}
            >
              <UserMinus className="h-4 w-4" />
              Kick {displayName}
            </button>
          )}
        </div>
      )}

      {/* Kick confirmation dialog */}
      <Dialog open={kickDialogOpen} onOpenChange={setKickDialogOpen}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Kick Member</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to kick{' '}
              <span className="font-semibold text-white">{displayName}</span>{' '}
              from the server? They will be able to rejoin with a new invite.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setKickDialogOpen(false)}
              className="text-gray-300 hover:text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleKick}
              disabled={kickMemberMutation.isPending}
            >
              {kickMemberMutation.isPending ? 'Kicking...' : 'Kick'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
