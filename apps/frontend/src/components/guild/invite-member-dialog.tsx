'use client';

import { useState, useCallback, useEffect } from 'react';
import { Copy, Check, Trash2, Link2, Clock, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useCreateInvite,
  useGuildInvites,
  useDeleteInvite,
} from '@/hooks/use-guild';
import { toast } from '@/hooks/use-toast';
import { ApiErrorResponse } from '@/lib/api-client';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string;
  guildName: string;
}

function getApiError(error: unknown): ApiErrorResponse | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  ) {
    return error as ApiErrorResponse;
  }
  return null;
}

function isPermissionDenied(error: unknown): boolean {
  return getApiError(error)?.statusCode === 403;
}

function getInviteUrl(code: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/invite/${code}`;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'Never';
  const date = new Date(expiresAt);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function InviteMemberDialog({
  open,
  onOpenChange,
  guildId,
  guildName,
}: InviteMemberDialogProps) {
  const {
    data: invites,
    isLoading,
    isError: isInviteListError,
    error: inviteListError,
  } = useGuildInvites(open ? guildId : undefined);
  const createInviteMutation = useCreateInvite();
  const deleteInviteMutation = useDeleteInvite();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isInviteListError) return;

    if (isPermissionDenied(inviteListError)) {
      toast({
        variant: 'destructive',
        title: 'Permission Denied',
        description:
          'You do not have permission to view invites in this guild.',
      });
      return;
    }

    toast({
      variant: 'destructive',
      title: 'Error',
      description: 'Failed to load invites',
    });
  }, [open, isInviteListError, inviteListError]);

  const handleCreateInvite = useCallback(async () => {
    try {
      const invite = await createInviteMutation.mutateAsync({
        guildId,
        data: { maxAge: 86400, maxUses: 0 },
      });
      if (invite) {
        const url = getInviteUrl(invite.code);
        await navigator.clipboard.writeText(url);
        setCopiedCode(invite.code);
        setTimeout(() => setCopiedCode(null), 2000);
        toast({
          title: 'Invite Created',
          description: 'Invite link copied to clipboard!',
        });
      }
    } catch (err: unknown) {
      if (isPermissionDenied(err)) {
        toast({
          variant: 'destructive',
          title: 'Permission Denied',
          description:
            'You do not have permission to create invites in this guild.',
        });
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to create invite';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    }
  }, [guildId, createInviteMutation]);

  const handleCopyLink = useCallback(async (code: string) => {
    const url = getInviteUrl(code);
    await navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({
      title: 'Copied!',
      description: 'Invite link copied to clipboard',
    });
  }, []);

  const handleDeleteInvite = useCallback(
    async (code: string) => {
      try {
        await deleteInviteMutation.mutateAsync({ guildId, code });
        toast({
          title: 'Invite Deleted',
          description: 'The invite has been revoked',
        });
      } catch (err: unknown) {
        if (isPermissionDenied(err)) {
          toast({
            variant: 'destructive',
            title: 'Permission Denied',
            description:
              'You do not have permission to delete invites in this guild.',
          });
          return;
        }

        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to delete invite',
        });
      }
    },
    [guildId, deleteInviteMutation],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            Invite Members to {guildName}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Share an invite link with friends to let them join your guild.
          </DialogDescription>
        </DialogHeader>

        {/* Quick Create */}
        <div className="space-y-3">
          <Button
            onClick={handleCreateInvite}
            disabled={createInviteMutation.isPending}
            className="w-full bg-indigo-500 hover:bg-indigo-600"
          >
            <Link2 className="mr-2 h-4 w-4" />
            {createInviteMutation.isPending
              ? 'Creating...'
              : 'Generate Invite Link (24h)'}
          </Button>
        </div>

        <Separator className="bg-gray-700" />

        {/* Existing Invites */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-gray-400">
            Active Invites
          </h4>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 animate-pulse"
                >
                  <div className="h-3 w-24 bg-gray-700 rounded" />
                  <div className="flex-1" />
                  <div className="h-6 w-16 bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          ) : !invites || invites.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No active invites. Create one above!
            </p>
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1">
                {invites.map((invite) => (
                  <div
                    key={invite.code}
                    className="flex items-center gap-2 p-2 rounded-md bg-gray-900/50 hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-indigo-300 truncate">
                        {invite.code}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {formatExpiry(invite.expiresAt)}
                        </span>
                        <span>
                          {invite.uses}
                          {invite.maxUses > 0 ? `/${invite.maxUses}` : ''} uses
                        </span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-gray-400 hover:text-white shrink-0"
                      onClick={() => handleCopyLink(invite.code)}
                    >
                      {copiedCode === invite.code ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-gray-400 hover:text-red-400 shrink-0"
                      onClick={() => handleDeleteInvite(invite.code)}
                      disabled={deleteInviteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
