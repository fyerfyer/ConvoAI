'use client';

import { Bot, Settings2, Users, Shield, UserCog } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BotList from '@/components/bot/bot-list';
import RoleSettingsPanel from '@/components/guild/role-settings-panel';
import MemberSettingsPanel from '@/components/guild/member-settings-panel';
import { GuildResponse } from '@discord-platform/shared';
import { usePermissions } from '@/hooks/use-permission';

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
  defaultTab = 'overview',
}: GuildSettingsDialogProps) {
  const { canManageRoles, canKickMembers } = usePermissions(guild?.id);

  if (!guild) return null;

  const showRolesTab = canManageRoles;
  const showMembersTab = canManageRoles || canKickMembers;

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
          className="flex-1 flex flex-col overflow-hidden min-w-0"
        >
          <TabsList className="bg-gray-900 border-b border-gray-700 w-full justify-start rounded-none px-2 shrink-0 overflow-x-hidden">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Users className="h-4 w-4" />
              Overview
            </TabsTrigger>
            {showRolesTab && (
              <TabsTrigger
                value="roles"
                className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 gap-1.5"
              >
                <Shield className="h-4 w-4" />
                Roles
              </TabsTrigger>
            )}
            {showMembersTab && (
              <TabsTrigger
                value="members"
                className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 gap-1.5"
              >
                <UserCog className="h-4 w-4" />
                Members
              </TabsTrigger>
            )}
            <TabsTrigger
              value="bots"
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Bot className="h-4 w-4" />
              Bots & Agents
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
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

            {showRolesTab && (
              <TabsContent value="roles" className="mt-0">
                <RoleSettingsPanel guild={guild} />
              </TabsContent>
            )}

            {showMembersTab && (
              <TabsContent value="members" className="mt-0">
                <MemberSettingsPanel guild={guild} />
              </TabsContent>
            )}

            <TabsContent value="bots" className="mt-0">
              <BotList guildId={guild.id} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
