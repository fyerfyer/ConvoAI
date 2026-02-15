'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateBot } from '@/hooks/use-bot';
import { BotResponse, BOT_STATUS } from '@discord-platform/shared';

interface EditBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: BotResponse | null;
  guildId: string;
}

export default function EditBotDialog({
  open,
  onOpenChange,
  bot,
  guildId,
}: EditBotDialogProps) {
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>(BOT_STATUS.ACTIVE);

  const updateBot = useUpdateBot();

  // Populate fields when bot changes
  useEffect(() => {
    if (bot) {
      setName(bot.name);
      setWebhookUrl(bot.webhookUrl);
      setDescription(bot.description || '');
      setStatus(bot.status);
    }
  }, [bot]);

  const handleSubmit = async () => {
    if (!bot || !name.trim() || !webhookUrl.trim()) return;

    try {
      await updateBot.mutateAsync({
        botId: bot.id,
        guildId,
        data: {
          name: name.trim(),
          webhookUrl: webhookUrl.trim(),
          description: description.trim() || undefined,
          status: status as 'active' | 'inactive',
        },
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Bot</DialogTitle>
          <DialogDescription className="text-gray-400">
            Update your bot&apos;s configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="edit-name" className="text-gray-300 text-xs">
              Bot Name
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 bg-gray-900 border-gray-600 text-white"
              maxLength={50}
            />
          </div>

          {/* Webhook URL */}
          <div>
            <Label htmlFor="edit-url" className="text-gray-300 text-xs">
              Webhook URL
            </Label>
            <Input
              id="edit-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="mt-1 bg-gray-900 border-gray-600 text-white"
              type="url"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="edit-desc" className="text-gray-300 text-xs">
              Description
            </Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 bg-gray-900 border-gray-600 text-white resize-none"
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Status */}
          <div>
            <Label className="text-gray-300 text-xs mb-2 block">Status</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStatus(BOT_STATUS.ACTIVE)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  status === BOT_STATUS.ACTIVE
                    ? 'border-green-500 bg-green-500/10 text-green-300'
                    : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatus(BOT_STATUS.INACTIVE)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  status === BOT_STATUS.INACTIVE
                    ? 'border-gray-400 bg-gray-500/10 text-gray-300'
                    : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
                }`}
              >
                Inactive
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-gray-400"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !webhookUrl.trim() || updateBot.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {updateBot.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            ) : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
