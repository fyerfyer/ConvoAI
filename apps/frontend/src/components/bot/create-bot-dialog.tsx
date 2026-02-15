'use client';

import { useState } from 'react';
import { Bot, Cpu } from 'lucide-react';
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
import { useCreateBot } from '@/hooks/use-bot';
import { BOT_TYPE } from '@discord-platform/shared';
import { cn } from '@/lib/utils';

interface CreateBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string;
}

export default function CreateBotDialog({
  open,
  onOpenChange,
  guildId,
}: CreateBotDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(BOT_TYPE.CHATBOT);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [description, setDescription] = useState('');
  const [secretResult, setSecretResult] = useState<{
    webhookSecret: string;
    webhookToken: string;
  } | null>(null);

  const createBot = useCreateBot();

  const handleSubmit = async () => {
    if (!name.trim() || !webhookUrl.trim()) return;

    try {
      const result = await createBot.mutateAsync({
        name: name.trim(),
        guildId,
        type: type as 'chatbot' | 'agent',
        webhookUrl: webhookUrl.trim(),
        description: description.trim() || '',
      });

      if (result) {
        setSecretResult({
          webhookSecret: result.webhookSecret,
          webhookToken: result.bot.webhookToken,
        });
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setName('');
    setType(BOT_TYPE.CHATBOT);
    setWebhookUrl('');
    setDescription('');
    setSecretResult(null);
    onOpenChange(false);
  };

  // Show success dialog with secret
  if (secretResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-green-400">
              Bot Created Successfully!
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Save these credentials now. The webhook secret will not be shown
              again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-300 text-xs">Webhook Token</Label>
              <div className="mt-1 rounded bg-gray-900 p-2 font-mono text-xs text-gray-300 break-all select-all">
                {secretResult.webhookToken}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                Used in the callback URL for your bot to send messages.
              </p>
            </div>
            <div>
              <Label className="text-gray-300 text-xs">
                Webhook Secret (HMAC Signing)
              </Label>
              <div className="mt-1 rounded bg-gray-900 p-2 font-mono text-xs text-amber-300 break-all select-all">
                {secretResult.webhookSecret}
              </div>
              <p className="mt-1 text-[11px] text-red-400">
                This secret is used to verify webhook signatures. Save it now —
                it will NOT be shown again.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleClose}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              I&apos;ve Saved These Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a New Bot</DialogTitle>
          <DialogDescription className="text-gray-400">
            Add a bot or AI agent to your guild. The bot will be triggered when
            @mentioned in a channel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bot Type Selection */}
          <div>
            <Label className="text-gray-300 text-xs mb-2 block">Bot Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType(BOT_TYPE.CHATBOT)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all',
                  type === BOT_TYPE.CHATBOT
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 bg-gray-700/50 hover:border-gray-500',
                )}
              >
                <Bot
                  className={cn(
                    'h-8 w-8',
                    type === BOT_TYPE.CHATBOT
                      ? 'text-blue-400'
                      : 'text-gray-400',
                  )}
                />
                <div className="text-center">
                  <div className="text-sm font-medium text-white">Chatbot</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Fixed tasks, welcome messages, scheduled embeds
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setType(BOT_TYPE.AGENT)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all',
                  type === BOT_TYPE.AGENT
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-600 bg-gray-700/50 hover:border-gray-500',
                )}
              >
                <Cpu
                  className={cn(
                    'h-8 w-8',
                    type === BOT_TYPE.AGENT
                      ? 'text-purple-400'
                      : 'text-gray-400',
                  )}
                />
                <div className="text-center">
                  <div className="text-sm font-medium text-white">AI Agent</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    LLM-powered, summarize, translate, analyze
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <Label htmlFor="bot-name" className="text-gray-300 text-xs">
              Bot Name
            </Label>
            <Input
              id="bot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === BOT_TYPE.AGENT
                  ? 'e.g. SummaryAgent'
                  : 'e.g. WelcomeBot'
              }
              className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              maxLength={50}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Users will @mention this name to trigger the bot.
            </p>
          </div>

          {/* Webhook URL */}
          <div>
            <Label htmlFor="webhook-url" className="text-gray-300 text-xs">
              Webhook URL
            </Label>
            <Input
              id="webhook-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-agent-server.com/webhook"
              className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              type="url"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {type === BOT_TYPE.AGENT
                ? 'Your AI agent server endpoint that receives AgentPayload and returns text/event-stream or JSON.'
                : 'Your bot server endpoint that receives event payloads and returns responses.'}
            </p>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="bot-desc" className="text-gray-300 text-xs">
              Description (optional)
            </Label>
            <Textarea
              id="bot-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this bot do?"
              className="mt-1 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500 resize-none"
              rows={2}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-gray-400"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !webhookUrl.trim() || createBot.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {createBot.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            ) : null}
            Create Bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
