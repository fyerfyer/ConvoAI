import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  ApiResponse,
  UserResponse,
  UpdateUserDTO,
  IUserPublic,
} from '@discord-platform/shared';

/**
 * Query key factory for user queries
 */
export const userKeys = {
  all: ['users'] as const,
  profile: () => [...userKeys.all, 'profile'] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

/**
 * Hook to fetch current user profile
 */
export function useProfile() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: userKeys.profile(),
    queryFn: async () => {
      const response = await api.get<ApiResponse<UserResponse>>('/users/me');
      return response.data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to update user profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: async (updateData: UpdateUserDTO) => {
      const response = await api.patch<ApiResponse<UserResponse>>(
        '/users/me',
        updateData,
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.user) {
        // Update Zustand store
        updateUser(data.user);

        // Invalidate and refetch profile query
        queryClient.invalidateQueries({ queryKey: userKeys.profile() });
      }
    },
  });
}

/**
 * Hook to fetch user by ID
 */
export function useUser(userId: string) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: async () => {
      const response = await api.get<ApiResponse<UserResponse>>(
        `/users/${userId}`,
      );
      return response.data;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
