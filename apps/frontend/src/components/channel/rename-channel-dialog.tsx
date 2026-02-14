'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChannelResponse } from '@discord-platform/shared';

interface RenameChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChannelResponse | null;
  onRename: (channelId: string, newName: string) => void;
}

export default function RenameChannelDialog({
  open,
  onOpenChange,
  channel,
  onRename,
}: RenameChannelDialogProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (channel) {
      setName(channel.name);
    }
  }, [channel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel || !name.trim()) return;
    onRename(channel.id, name.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename Channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="channel-name" className="text-gray-300">
                Channel Name
              </Label>
              <Input
                id="channel-name"
                value={name}
                onChange={(e) =>
                  setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))
                }
                className="bg-gray-900 border-gray-700 text-white"
                placeholder="channel-name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || name === channel?.name}
              className="bg-indigo-500 hover:bg-indigo-600"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
