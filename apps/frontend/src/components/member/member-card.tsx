'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AtSign,
  Crown,
  MoreVertical,
  UserMinus,
  VolumeX,
  Volume2,
  Shield,
  ShieldCheck,
  ChevronRight,
  Clock,
} from 'lucide-react';
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
import {
  MemberResponse,
  GuildResponse,
  RoleResponse,
} from '@discord-platform/shared';
import {
  useKickMember,
  useMuteMember,
  useUnmuteMember,
} from '@/hooks/use-member';
import { useAddRoleToMember, useRemoveRoleFromMember } from '@/hooks/use-role';
import { useCurrentUser } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permission';

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

const MUTE_DURATIONS = [
  { label: '60 seconds', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '10 minutes', value: 10 },
  { label: '1 hour', value: 60 },
  { label: '1 day', value: 1440 },
  { label: '1 week', value: 10080 },
];

export default function MemberCard({ member, guild }: MemberCardProps) {
  const currentUser = useCurrentUser();
  const { canKickMembers, canMuteMembers, canManageRoles } = usePermissions(
    guild.id,
  );
  const kickMemberMutation = useKickMember();
  const muteMemberMutation = useMuteMember();
  const unmuteMemberMutation = useUnmuteMember();
  const addRoleMutation = useAddRoleToMember();
  const removeRoleMutation = useRemoveRoleFromMember();
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [muteSubmenuOpen, setMuteSubmenuOpen] = useState(false);
  const [roleSubmenuOpen, setRoleSubmenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const displayName = member.nickname || member.user?.name || 'Unknown';
  const isOwner = guild.ownerId === member.userId;
  const isCurrentUser = currentUser?.id === member.userId;
  const canKick = canKickMembers && !isCurrentUser && !isOwner;
  const canMute = canMuteMembers && !isCurrentUser && !isOwner;
  const canAssignRoles = canManageRoles && !isCurrentUser;

  const isMuted = member.mutedUntil && new Date(member.mutedUntil) > new Date();

  const availableRoles = (guild.roles || [])
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position);
  const memberRoleIds = new Set(member.roles);

  const handleKick = () => {
    kickMemberMutation.mutate(
      { guildId: guild.id, userId: member.userId },
      {
        onSuccess: () => setKickDialogOpen(false),
      },
    );
  };

  const handleMute = (duration: number) => {
    muteMemberMutation.mutate(
      { guildId: guild.id, userId: member.userId, duration },
      { onSuccess: () => setContextMenu(null) },
    );
  };

  const handleUnmute = () => {
    unmuteMemberMutation.mutate(
      { guildId: guild.id, userId: member.userId },
      { onSuccess: () => setContextMenu(null) },
    );
  };

  const toggleRole = (role: RoleResponse) => {
    if (memberRoleIds.has(role.id)) {
      removeRoleMutation.mutate({
        guildId: guild.id,
        userId: member.userId,
        roleId: role.id,
      });
    } else {
      addRoleMutation.mutate({
        guildId: guild.id,
        userId: member.userId,
        roleId: role.id,
      });
    }
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

    const close = (e: MouseEvent) => {
      // Don't close if the click is inside the context menu
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
      setMuteSubmenuOpen(false);
      setRoleSubmenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
        setMuteSubmenuOpen(false);
        setRoleSubmenuOpen(false);
      }
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('contextmenu', close);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('contextmenu', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const hasAnyAction = canKick || canMute;

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
          {isMuted && (
            <div className="absolute -bottom-0.5 -right-0.5 bg-red-500 rounded-full p-0.5">
              <VolumeX className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm text-gray-300 truncate">{displayName}</p>
            {isOwner && (
              <Crown className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            )}
            {isMuted && <VolumeX className="h-3 w-3 text-red-400 shrink-0" />}
          </div>
        </div>
        {/* Action menu */}
        {hasAnyAction && (
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
              {canMute && !isMuted && (
                <DropdownMenuItem
                  onClick={() => handleMute(10)}
                  className="text-orange-400 focus:text-orange-400 focus:bg-orange-500/10"
                >
                  <VolumeX className="mr-2 h-4 w-4" />
                  <span>Mute (10 min)</span>
                </DropdownMenuItem>
              )}
              {canMute && isMuted && (
                <DropdownMenuItem
                  onClick={handleUnmute}
                  className="text-green-400 focus:text-green-400 focus:bg-green-500/10"
                >
                  <Volume2 className="mr-2 h-4 w-4" />
                  <span>Unmute</span>
                </DropdownMenuItem>
              )}
              {canKick && (
                <DropdownMenuItem
                  onClick={() => setKickDialogOpen(true)}
                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                >
                  <UserMinus className="mr-2 h-4 w-4" />
                  <span>Kick {displayName}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] w-44 rounded-md border border-gray-600 bg-gray-800 p-1 shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {/* Mention */}
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors"
            onClick={handleMention}
          >
            <AtSign className="h-4 w-4" />
            Mention
          </button>

          {/* Roles submenu */}
          {canAssignRoles && availableRoles.length > 0 && (
            <div className="relative">
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setRoleSubmenuOpen(!roleSubmenuOpen);
                  setMuteSubmenuOpen(false);
                }}
              >
                <Shield className="h-4 w-4" />
                Roles
                <ChevronRight className="h-3 w-3 ml-auto" />
              </button>
              {roleSubmenuOpen && (
                <div className="absolute right-full top-0 mr-1 w-44 rounded-md border border-gray-600 bg-gray-800 p-1 shadow-lg z-[101]">
                  {availableRoles.map((role) => {
                    const hasRole = memberRoleIds.has(role.id);
                    return (
                      <button
                        key={role.id}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-indigo-500 hover:text-white transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRole(role);
                        }}
                      >
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: role.color }}
                        />
                        <span className="flex-1 text-left truncate">
                          {role.name}
                        </span>
                        {hasRole && (
                          <ShieldCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Separator if there are moderation actions */}
          {(canMute || canKick) && (
            <div className="my-1 border-t border-gray-600" />
          )}

          {/* Mute submenu */}
          {canMute && !isMuted && (
            <div className="relative">
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-orange-400 hover:bg-orange-500 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setMuteSubmenuOpen(!muteSubmenuOpen);
                  setRoleSubmenuOpen(false);
                }}
              >
                <VolumeX className="h-4 w-4" />
                Mute
                <ChevronRight className="h-3 w-3 ml-auto" />
              </button>
              {muteSubmenuOpen && (
                <div className="absolute right-full top-0 mr-1 w-40 rounded-md border border-gray-600 bg-gray-800 p-1 shadow-lg z-[101]">
                  {MUTE_DURATIONS.map((d) => (
                    <button
                      key={d.value}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-orange-500 hover:text-white transition-colors"
                      onClick={() => handleMute(d.value)}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unmute */}
          {canMute && isMuted && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-green-400 hover:bg-green-500 hover:text-white transition-colors"
              onClick={handleUnmute}
            >
              <Volume2 className="h-4 w-4" />
              Unmute
            </button>
          )}

          {/* Kick */}
          {canKick && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
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
