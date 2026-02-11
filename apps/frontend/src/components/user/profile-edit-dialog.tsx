'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCurrentUser } from '../../hooks/use-auth';
import { useUpdateProfile } from '../../hooks/use-user';
import { useUIStore } from '../../stores/ui-store';
import { updateUserSchema, UpdateUserDTO } from '@discord-platform/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../components/ui/form';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '../../components/ui/avatar';
import AvatarUpload from './avatar-upload';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';

export default function ProfileEditDialog() {
  const { toast } = useToast();
  const user = useCurrentUser();
  const updateProfileMutation = useUpdateProfile();
  const open = useUIStore((state) => state.profileEditOpen);
  const setOpen = useUIStore((state) => state.setProfileEditOpen);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user?.avatar || null,
  );
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    user?.banner || null,
  );
  const [bannerBlob, setBannerBlob] = useState<Blob | null>(null);

  const form = useForm<UpdateUserDTO>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      avatar: user?.avatar || null,
      banner: user?.banner || null,
    },
  });

  /*
   * Helper to convert Blob to Base64
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const onSubmit = async (data: UpdateUserDTO) => {
    try {
      let finalAvatarUrl = avatarUrl;
      let finalBannerUrl = bannerUrl;

      // If we have a new blob, convert it to base64 for upload
      if (avatarBlob) {
        finalAvatarUrl = await blobToBase64(avatarBlob);
      }

      if (bannerBlob) {
        finalBannerUrl = await blobToBase64(bannerBlob);
      }

      const updateData: UpdateUserDTO = {
        ...data,
        avatar: finalAvatarUrl,
        banner: finalBannerUrl,
      };

      await updateProfileMutation.mutateAsync(updateData);

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });
      setOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to update profile',
      });
    }
  };

  const handleAvatarCrop = (croppedUrl: string, croppedBlob: Blob) => {
    setAvatarUrl(croppedUrl);
    setAvatarBlob(croppedBlob);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setBannerUrl(url);
      setBannerBlob(file);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information and avatar
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                {/* Current Avatar Preview */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl || undefined} />
                    <AvatarFallback className="bg-indigo-500 text-white text-xl">
                      {user?.name ? getInitials(user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm text-gray-600">
                    <p className="font-medium">{user?.name}</p>
                    <p>{user?.email}</p>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending
                      ? 'Saving...'
                      : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6">
            <div>
              <h3 className="mb-4 text-sm font-medium">Avatar</h3>
              <AvatarUpload
                onCropComplete={handleAvatarCrop}
                initialImage={user?.avatar || undefined}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Banner</h3>
              <div className="space-y-2">
                {bannerUrl && (
                  <div className="h-32 w-full overflow-hidden rounded-lg">
                    <img
                      src={bannerUrl}
                      alt="Banner preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <label className="block">
                  <span className="sr-only">Choose banner image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </label>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
