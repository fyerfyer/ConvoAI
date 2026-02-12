'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
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
import { useCreateGuild } from '@/hooks/use-guild';
import { createGuildSchema, CreateGuildDTO } from '@discord-platform/shared';

interface CreateGuildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateGuildDialog({
  open,
  onOpenChange,
}: CreateGuildDialogProps) {
  const router = useRouter();
  const createGuildMutation = useCreateGuild();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateGuildDTO>({
    resolver: zodResolver(createGuildSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (data: CreateGuildDTO) => {
    setError(null);
    try {
      const guild = await createGuildMutation.mutateAsync(data);
      reset();
      onOpenChange(false);
      router.push(`/app/guilds/${guild.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to create guild';
      setError(message);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset();
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle>Create a Guild</DialogTitle>
          <DialogDescription className="text-gray-400">
            Your guild is where you and your friends hang out. Give it a name
            and start chatting.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-300">
              Guild Name
            </Label>
            <Input
              id="name"
              placeholder="Enter guild name"
              className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              {...register('name')}
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
              disabled={isSubmitting || createGuildMutation.isPending}
              className="bg-indigo-500 hover:bg-indigo-600"
            >
              {createGuildMutation.isPending ? 'Creating...' : 'Create Guild'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
