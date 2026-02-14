'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useInviteInfo, useJoinViaInvite } from '@/hooks/use-guild';
import { useIsAuthenticated } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/hooks/use-toast';

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const isAuthenticated = useIsAuthenticated();
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const { data: invite, isLoading, error } = useInviteInfo(code);
  const joinMutation = useJoinViaInvite();
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace(`/login?redirect=/invite/${code}`);
    }
  }, [hasHydrated, isAuthenticated, code, router]);

  const handleJoin = async () => {
    if (!code) return;
    setJoining(true);
    try {
      const guild = await joinMutation.mutateAsync(code);
      toast({
        title: 'Joined Guild',
        description: guild
          ? `Welcome to ${guild.name}!`
          : 'Joined successfully!',
      });
      if (guild) {
        router.push(`/app/guilds/${guild.id}`);
      } else {
        router.push('/app');
      }
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
    } finally {
      setJoining(false);
    }
  };

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-white mx-auto" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <Card className="w-[400px] bg-gray-800 border-gray-700">
          <CardContent className="p-8 text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-white mx-auto" />
            <p className="text-sm text-gray-400">Loading invite...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <Card className="w-[400px] bg-gray-800 border-gray-700">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-2">
              Invalid Invite
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              This invite may be expired or invalid.
            </p>
            <Button
              onClick={() => router.push('/app')}
              className="bg-indigo-500 hover:bg-indigo-600"
            >
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      <Card className="w-[400px] bg-gray-800 border-gray-700">
        <CardContent className="p-8 text-center">
          <p className="text-xs uppercase text-gray-400 font-semibold mb-4">
            You&apos;ve been invited to join
          </p>

          <Avatar className="h-20 w-20 mx-auto mb-4 rounded-2xl">
            <AvatarImage
              src={invite.guild.icon || undefined}
              className="rounded-2xl"
            />
            <AvatarFallback className="rounded-2xl bg-indigo-500 text-white text-2xl font-bold">
              {invite.guild.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <h2 className="text-2xl font-bold text-white mb-1">
            {invite.guild.name}
          </h2>

          <div className="flex items-center justify-center gap-1 text-sm text-gray-400 mb-6">
            <Users className="h-4 w-4" />
            <span>
              {invite.guild.memberCount ?? '?'} member
              {invite.guild.memberCount !== 1 ? 's' : ''}
            </span>
          </div>

          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-base py-5"
          >
            {joining ? 'Joining...' : 'Accept Invite'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
