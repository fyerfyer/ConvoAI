'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useRegenerateToken } from '@/hooks/use-bot';
import { BotResponse } from '@discord-platform/shared';

interface RegenerateTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: BotResponse | null;
  guildId: string;
}

export default function RegenerateTokenDialog({
  open,
  onOpenChange,
  bot,
  guildId,
}: RegenerateTokenDialogProps) {
  const [result, setResult] = useState<{
    webhookToken: string;
    webhookSecret: string;
  } | null>(null);
  const regenerate = useRegenerateToken();

  const handleRegenerate = async () => {
    if (!bot) return;
    try {
      const data = await regenerate.mutateAsync({
        botId: bot.id,
        guildId,
      });
      if (data) {
        setResult(data);
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
  };

  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-green-400">
              Token Regenerated
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Your bot&apos;s credentials have been regenerated. Save them now.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-300 text-xs">New Webhook Token</Label>
              <div className="mt-1 rounded bg-gray-900 p-2 font-mono text-xs text-gray-300 break-all select-all">
                {result.webhookToken}
              </div>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">
                New Webhook Secret
              </Label>
              <div className="mt-1 rounded bg-gray-900 p-2 font-mono text-xs text-amber-300 break-all select-all">
                {result.webhookSecret}
              </div>
              <p className="mt-1 text-[11px] text-red-400">
                Save this secret now — it will NOT be shown again.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleClose}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Regenerate Token
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            This will invalidate the current webhook token and secret for{' '}
            <strong className="text-white">{bot?.name}</strong>. Your bot server
            will need to be updated with the new credentials.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-gray-400"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRegenerate}
            disabled={regenerate.isPending}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {regenerate.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            ) : null}
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
