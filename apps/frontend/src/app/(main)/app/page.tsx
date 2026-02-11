'use client';

import { useCurrentUser } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserProfileCard from '@/components/user/user-profile-card';

export default function AppHomePage() {
  const user = useCurrentUser();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Welcome Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            Welcome back, {user?.name || 'User'}! 👋
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            This is your Discord platform homepage. Select a guild from the left
            sidebar to get started.
          </p>
        </CardContent>
      </Card>

      {/* User Profile Card */}
      <div className="grid gap-6 md:grid-cols-2">
        <UserProfileCard />
      </div>
    </div>
  );
}
