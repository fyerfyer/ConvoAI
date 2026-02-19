'use client';

import { useState } from 'react';
import {
  useMembers,
  useUpdateNickname,
  useLeaveGuild,
} from '@/hooks/use-member';
import { useGuild } from '@/hooks/use-guild';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Separator } from '@/components/ui/separator';
import { LogOut, Pencil, Crown } from 'lucide-react';
import MemberCard from './member-card';
import { useCurrentUser } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

interface MemberListProps {
  guildId: string;
}

export default function MemberList({ guildId }: MemberListProps) {
  const { data: members, isLoading } = useMembers(guildId);
  const { data: guild } = useGuild(guildId);
  const currentUser = useCurrentUser();
  const router = useRouter();
  const updateNicknameMutation = useUpdateNickname();
  const leaveGuildMutation = useLeaveGuild();

  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [newNickname, setNewNickname] = useState('');

  // Separate owner from other members
  const ownerMembers =
    members?.filter((m) => guild && m.userId === guild.ownerId) ?? [];
  const regularMembers =
    members?.filter((m) => guild && m.userId !== guild.ownerId) ?? [];

  const currentMember = members?.find((m) => m.userId === currentUser?.id);
  const isOwner = guild?.ownerId === currentUser?.id;

  const handleEditNickname = () => {
    setNewNickname(currentMember?.nickname || '');
    setNicknameDialogOpen(true);
  };

  const handleSaveNickname = () => {
    if (!guildId) return;
    updateNicknameMutation.mutate(
      { guildId, nickName: newNickname },
      { onSuccess: () => setNicknameDialogOpen(false) },
    );
  };

  const handleLeaveGuild = () => {
    leaveGuildMutation.mutate(
      { guildId },
      {
        onSuccess: () => {
          setLeaveDialogOpen(false);
          router.push('/app');
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="w-60 bg-gray-800 p-4">
        <div className="text-xs font-semibold uppercase text-gray-400 mb-3">
          Members
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-gray-700" />
              <div className="h-3 w-24 rounded bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-60 bg-gray-800 flex flex-col min-h-0">
        <div className="p-3 text-xs font-semibold uppercase text-gray-400">
          Members — {members?.length ?? 0}
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 pb-2">
          {/* Owner section */}
          {ownerMembers.length > 0 && guild && (
            <div className="mb-2">
              <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase text-gray-500">
                <Crown className="h-3 w-3 text-yellow-500" />
                Owner
              </div>
              {ownerMembers.map((member) => (
                <MemberCard key={member.id} member={member} guild={guild} />
              ))}
            </div>
          )}

          {/* Regular members section */}
          {regularMembers.length > 0 && guild && (
            <div className="mb-2">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-500">
                Members — {regularMembers.length}
              </div>
              <div className="space-y-0.5">
                {regularMembers.map((member) => (
                  <MemberCard key={member.id} member={member} guild={guild} />
                ))}
              </div>
            </div>
          )}
          </div>
        </ScrollArea>

        {/* Bottom actions */}
        <Separator className="bg-gray-700" />
        <div className="p-2 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-700 h-8"
            onClick={handleEditNickname}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit Nickname
          </Button>
          {!isOwner && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8"
              onClick={() => setLeaveDialogOpen(true)}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Leave Server
            </Button>
          )}
        </div>
      </div>

      {/* Nickname edit dialog */}
      <Dialog open={nicknameDialogOpen} onOpenChange={setNicknameDialogOpen}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Change Nickname</DialogTitle>
            <DialogDescription className="text-gray-400">
              This nickname will be displayed instead of your username in this
              server.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="Enter a nickname"
              className="bg-gray-900 border-gray-600 text-white"
              maxLength={32}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNicknameDialogOpen(false)}
              className="text-gray-300 hover:text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNickname}
              disabled={updateNicknameMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {updateNicknameMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave guild dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Leave Server</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to leave{' '}
              <span className="font-semibold text-white">{guild?.name}</span>?
              You won&apos;t be able to rejoin unless you are re-invited.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setLeaveDialogOpen(false)}
              className="text-gray-300 hover:text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeaveGuild}
              disabled={leaveGuildMutation.isPending}
            >
              {leaveGuildMutation.isPending ? 'Leaving...' : 'Leave Server'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
