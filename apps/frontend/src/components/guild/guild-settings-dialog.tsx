'use client';

import { Bot, Settings2, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BotList from '@/components/bot/bot-list';
import { GuildResponse } from '@discord-platform/shared';

interface GuildSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guild: GuildResponse | null;
  defaultTab?: string;
}

export default function GuildSettingsDialog({
  open,
  onOpenChange,
  guild,
  defaultTab = 'bots',
}: GuildSettingsDialogProps) {
  if (!guild) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-gray-400" />
            {guild.name} — Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs
          key={defaultTab}
          defaultValue={defaultTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="bg-gray-900 border-b border-gray-700 w-full justify-start rounded-none px-2">
            <TabsTrigger
              value="bots"
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Bot className="h-4 w-4" />
              Bots & Agents
            </TabsTrigger>
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Users className="h-4 w-4" />
              Overview
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="bots" className="mt-0">
              <BotList guildId={guild.id} />
            </TabsContent>

            <TabsContent value="overview" className="mt-0">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Guild Overview
                  </h3>
                  <div className="rounded-lg bg-gray-700/50 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Name</span>
                      <span className="text-white">{guild.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Members</span>
                      <span className="text-white">
                        {guild.memberCount ?? '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Created</span>
                      <span className="text-white">
                        {new Date(guild.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
