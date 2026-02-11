'use client';

import { useCurrentUser } from '../../hooks/use-auth';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Edit } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import ProfileEditDialog from './profile-edit-dialog';

export default function UserProfileCard() {
  const user = useCurrentUser();
  const setProfileEditOpen = useUIStore((state) => state.setProfileEditOpen);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <Card className="overflow-hidden">
        {/* Banner */}
        <div className="h-24 bg-gradient-to-r from-purple-500 to-indigo-500">
          {user.banner && (
            <img
              src={user.banner}
              alt="Profile banner"
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <CardHeader className="relative pt-0">
          {/* Avatar */}
          <div className="absolute -top-12 left-4">
            <Avatar className="h-24 w-24 border-4 border-white rounded-full">
              <AvatarImage
                src={user.avatar || undefined}
                className="rounded-full object-cover"
              />
              <AvatarFallback className="bg-indigo-500 text-white text-2xl">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Edit Button */}
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProfileEditOpen(true)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Profile
            </Button>
          </div>

          <CardTitle className="mt-8">{user.name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Email</p>
            <p className="text-sm">{user.email}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 mb-2">Status</p>
            <Badge variant="outline">{user.status || 'Online'}</Badge>
          </div>

          {user.isBot && <Badge variant="secondary">Bot</Badge>}

          <div>
            <p className="text-xs text-gray-500">
              Joined {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <ProfileEditDialog />
    </>
  );
}
