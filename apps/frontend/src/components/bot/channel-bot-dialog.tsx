'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ChannelBotManager from './channel-bot-manager';

interface ChannelBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  channelName: string;
  guildId: string;
}

export default function ChannelBotDialog({
  open,
  onOpenChange,
  channelId,
  channelName,
  guildId,
}: ChannelBotDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <span>#{channelName}</span>
            <span className="text-gray-400 font-normal text-sm">
              — Bot Management
            </span>
          </DialogTitle>
        </DialogHeader>
        <ChannelBotManager channelId={channelId} guildId={guildId} />
      </DialogContent>
    </Dialog>
  );
}
