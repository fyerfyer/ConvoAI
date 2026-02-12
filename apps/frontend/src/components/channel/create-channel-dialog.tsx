'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateChannel } from '@/hooks/use-channel';
import {
  CreateChannelDTO,
  CHANNEL,
  ChannelValue,
} from '@discord-platform/shared';

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string;
}

interface ChannelFormValues {
  name: string;
  type: ChannelValue;
}

export default function CreateChannelDialog({
  open,
  onOpenChange,
  guildId,
}: CreateChannelDialogProps) {
  const createChannelMutation = useCreateChannel();
  const [error, setError] = useState<string | null>(null);
  const [channelType, setChannelType] = useState<ChannelValue>(
    CHANNEL.GUILD_TEXT,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChannelFormValues>({
    defaultValues: {
      name: '',
      type: CHANNEL.GUILD_TEXT,
    },
  });

  const onSubmit = async (formData: ChannelFormValues) => {
    setError(null);
    try {
      const dto: CreateChannelDTO = {
        name: formData.name,
        type: channelType,
      };
      await createChannelMutation.mutateAsync({
        guildId,
        data: dto,
      });
      reset();
      setChannelType(CHANNEL.GUILD_TEXT);
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to create channel';
      setError(message);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset();
      setError(null);
      setChannelType(CHANNEL.GUILD_TEXT);
    }
    onOpenChange(isOpen);
  };

  const channelTypeOptions: { label: string; value: ChannelValue }[] = [
    { label: 'Text Channel', value: CHANNEL.GUILD_TEXT },
    { label: 'Voice Channel', value: CHANNEL.GUILD_VOICE },
    { label: 'Category', value: CHANNEL.GUILD_CATEGORY },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
          <DialogDescription className="text-gray-400">
            Create a new channel in this guild.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Channel Type */}
          <div className="space-y-2">
            <Label className="text-gray-300">Channel Type</Label>
            <div className="flex gap-2">
              {channelTypeOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={channelType === option.value ? 'default' : 'outline'}
                  size="sm"
                  className={
                    channelType === option.value
                      ? 'bg-indigo-500 hover:bg-indigo-600'
                      : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  }
                  onClick={() => setChannelType(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Channel Name */}
          <div className="space-y-2">
            <Label htmlFor="channelName" className="text-gray-300">
              Channel Name
            </Label>
            <Input
              id="channelName"
              placeholder="new-channel"
              className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              {...register('name', { required: 'Channel name is required' })}
            />
            {errors.name && (
              <p className="text-sm text-red-400">{errors.name.message}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createChannelMutation.isPending}
              className="bg-indigo-500 hover:bg-indigo-600"
            >
              {createChannelMutation.isPending
                ? 'Creating...'
                : 'Create Channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
