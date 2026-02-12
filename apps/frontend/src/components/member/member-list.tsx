'use client';

import { useMembers } from '@/hooks/use-member';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MemberResponse } from '@discord-platform/shared';

interface MemberListProps {
  guildId: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function MemberItem({ member }: { member: MemberResponse }) {
  const displayName = member.nickname || member.user?.name || 'Unknown';

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-700/50 cursor-pointer">
      <Avatar className="h-8 w-8">
        <AvatarImage src={member.user?.avatar || undefined} />
        <AvatarFallback className="bg-indigo-500 text-white text-xs">
          {getInitials(displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 truncate">{displayName}</p>
      </div>
    </div>
  );
}

export default function MemberList({ guildId }: MemberListProps) {
  const { data: members, isLoading } = useMembers(guildId);

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
    <div className="w-60 bg-gray-800 flex flex-col">
      <div className="p-3 text-xs font-semibold uppercase text-gray-400">
        Members — {members?.length ?? 0}
      </div>
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-0.5 pb-4">
          {members?.map((member) => (
            <MemberItem key={member.id} member={member} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
