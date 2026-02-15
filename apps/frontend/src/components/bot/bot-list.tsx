'use client';

import { useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BotCard from './bot-card';
import CreateBotDialog from './create-bot-dialog';
import EditBotDialog from './edit-bot-dialog';
import RegenerateTokenDialog from './regenerate-token-dialog';
import { useBots, useDeleteBot, useUpdateBot } from '@/hooks/use-bot';
import { BotResponse, BOT_STATUS } from '@discord-platform/shared';

interface BotListProps {
  guildId: string;
}

export default function BotList({ guildId }: BotListProps) {
  const { data: bots = [], isLoading } = useBots(guildId);
  const deleteBot = useDeleteBot();
  const updateBot = useUpdateBot();

  const [createOpen, setCreateOpen] = useState(false);
  const [editBot, setEditBot] = useState<BotResponse | null>(null);
  const [regenBot, setRegenBot] = useState<BotResponse | null>(null);

  const handleDelete = (bot: BotResponse) => {
    if (
      confirm(
        `Are you sure you want to delete "${bot.name}"? This action cannot be undone.`,
      )
    ) {
      deleteBot.mutate({ botId: bot.id, guildId });
    }
  };

  const handleToggleStatus = (bot: BotResponse) => {
    const newStatus =
      bot.status === BOT_STATUS.ACTIVE
        ? BOT_STATUS.INACTIVE
        : BOT_STATUS.ACTIVE;
    updateBot.mutate({
      botId: bot.id,
      guildId,
      data: { status: newStatus },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-700 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Bots & Agents</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Manage automated bots and AI agents for your guild.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Bot
        </Button>
      </div>

      {/* Bot list */}
      {bots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-600 p-8 text-center">
          <Bot className="mx-auto h-12 w-12 text-gray-500 mb-3" />
          <h4 className="text-sm font-medium text-gray-300 mb-1">
            No Bots Yet
          </h4>
          <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
            Add a chatbot for automated tasks, or an AI agent to answer
            questions using LLMs.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            variant="outline"
            className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Your First Bot
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              onEdit={setEditBot}
              onDelete={handleDelete}
              onToggleStatus={handleToggleStatus}
              onRegenerateToken={setRegenBot}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateBotDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        guildId={guildId}
      />
      <EditBotDialog
        open={!!editBot}
        onOpenChange={(open) => !open && setEditBot(null)}
        bot={editBot}
        guildId={guildId}
      />
      <RegenerateTokenDialog
        open={!!regenBot}
        onOpenChange={(open) => !open && setRegenBot(null)}
        bot={regenBot}
        guildId={guildId}
      />
    </div>
  );
}
