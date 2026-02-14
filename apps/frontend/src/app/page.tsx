'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsAuthenticated } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores/auth-store';

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return; // Wait for Zustand rehydration
    if (isAuthenticated) {
      router.replace('/app');
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, hasHydrated, router]);

  // Show loading while redirecting
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
