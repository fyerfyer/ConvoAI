'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsAuthenticated } from '@/hooks/use-auth';
import GuildSidebar from '@/components/layout/guild-sidebar';
import ChannelSidebar from '@/components/layout/channel-sidebar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Guild Sidebar (left) */}
      <GuildSidebar />

      {/* Channel Sidebar (middle) */}
      <ChannelSidebar />

      {/* Main Content Area (right) */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
