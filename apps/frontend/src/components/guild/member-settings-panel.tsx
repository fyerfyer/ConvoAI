'use client';

import { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  UserMinus,
  ChevronDown,
  Crown,
  Search,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GuildResponse,
  MemberResponse,
  RoleResponse,
} from '@discord-platform/shared';
import { useMembers, useKickMember } from '@/hooks/use-member';
import { useAddRoleToMember, useRemoveRoleFromMember } from '@/hooks/use-role';
import { usePermissions } from '@/hooks/use-permission';
import { useCurrentUser } from '@/hooks/use-auth';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function RoleAssignDropdown({
  guild,
  member,
}: {
  guild: GuildResponse;
  member: MemberResponse;
}) {
  const addRoleMutation = useAddRoleToMember();
  const removeRoleMutation = useRemoveRoleFromMember();

  const roles = (guild.roles || [])
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position);

  const memberRoleIds = new Set(member.roles);

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

  const isPending = addRoleMutation.isPending || removeRoleMutation.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-gray-400 hover:text-white gap-1"
          disabled={isPending}
        >
          <Shield className="h-3.5 w-3.5" />
          Roles
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-gray-900 border-gray-700">
        {roles.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">
            No roles available
          </div>
        ) : (
          roles.map((role) => {
            const hasRole = memberRoleIds.has(role.id);
            return (
              <DropdownMenuItem
                key={role.id}
                onClick={() => toggleRole(role)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: role.color }}
                />
                <span className="flex-1 text-gray-200">{role.name}</span>
                {hasRole && (
                  <ShieldCheck className="h-4 w-4 text-indigo-400" />
                )}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MemberRow({
  member,
  guild,
  canManageRoles,
  canKick,
  isCurrentUser,
}: {
  member: MemberResponse;
  guild: GuildResponse;
  canManageRoles: boolean;
  canKick: boolean;
  isCurrentUser: boolean;
}) {
  const [kickOpen, setKickOpen] = useState(false);
  const kickMutation = useKickMember();

  const displayName = member.nickname || member.user?.name || 'Unknown';
  const username = member.user?.name || 'Unknown';
  const isOwner = guild.ownerId === member.userId;

  // Resolve role names for display
  const memberRoles = (guild.roles || []).filter(
    (r) => member.roles.includes(r.id) && r.name !== '@everyone',
  );

  const handleKick = () => {
    kickMutation.mutate(
      { guildId: guild.id, userId: member.userId },
      { onSuccess: () => setKickOpen(false) },
    );
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-700/30 transition-colors group">
        {/* Avatar */}
        <Avatar className="h-9 w-9">
          <AvatarImage src={member.user?.avatar || undefined} />
          <AvatarFallback className="bg-indigo-500 text-white text-xs">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>

        {/* Name + roles */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-white truncate">
              {displayName}
            </p>
            {isOwner && (
              <Crown className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-gray-500">{username}</span>
            {memberRoles.length > 0 && (
              <>
                <span className="text-xs text-gray-600 mx-1">·</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {memberRoles.map((role) => (
                    <span
                      key={role.id}
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-gray-700/50"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      <span className="text-gray-300">{role.name}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isOwner && !isCurrentUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canManageRoles && (
              <RoleAssignDropdown guild={guild} member={member} />
            )}
            {canKick && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1"
                onClick={() => setKickOpen(true)}
              >
                <UserMinus className="h-3.5 w-3.5" />
                Kick
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Kick confirmation */}
      <Dialog open={kickOpen} onOpenChange={setKickOpen}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Kick Member</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to kick{' '}
              <span className="font-semibold text-white">{displayName}</span>{' '}
              from the server?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setKickOpen(false)}
              className="text-gray-300 hover:text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleKick}
              disabled={kickMutation.isPending}
            >
              {kickMutation.isPending ? 'Kicking...' : 'Kick'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Members Settings Panel ─────────────────────────────

interface MemberSettingsPanelProps {
  guild: GuildResponse;
}

export default function MemberSettingsPanel({
  guild,
}: MemberSettingsPanelProps) {
  const [search, setSearch] = useState('');
  const { data: members = [] } = useMembers(guild.id);
  const currentUser = useCurrentUser();
  const { canManageRoles, canKickMembers } = usePermissions(guild.id);

  const filteredMembers = members.filter((m) => {
    const name = (
      m.nickname ||
      m.user?.name ||
      ''
    ).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Members</h3>
        <p className="text-sm text-gray-400">
          {members.length} member{members.length !== 1 ? 's' : ''} — Manage
          roles and moderation.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members..."
          className="pl-9 bg-gray-900 border-gray-600 text-white"
        />
      </div>

      {/* Member list */}
      <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
        {filteredMembers.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            guild={guild}
            canManageRoles={canManageRoles}
            canKick={canKickMembers}
            isCurrentUser={currentUser?.id === member.userId}
          />
        ))}
        {filteredMembers.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">
            {search ? 'No members found.' : 'No members.'}
          </p>
        )}
      </div>
    </div>
  );
}
