import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import {
  LoginDTO,
  RegisterDTO,
  ApiResponse,
  AuthResponse,
} from '@discord-platform/shared';

// Login
export function useLogin() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  return useMutation({
    mutationFn: async (credentials: LoginDTO) => {
      return api.post<ApiResponse<AuthResponse>>('/auth/login', credentials);
    },
    onSuccess: (data) => {
      if (data.data) {
        const { user, token } = data.data;
        login(user, token);
        router.push('/app');
      }
    },
  });
}

// Register
export function useRegister() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  return useMutation({
    mutationFn: async (userData: RegisterDTO) => {
      return api.post<ApiResponse<AuthResponse>>('/auth/register', userData);
    },
    onSuccess: (data) => {
      if (data.data) {
        const { user, token } = data.data;
        // Auto-login after registration
        login(user, token);
        router.push('/app');
      }
    },
  });
}

// Logout
export function useLogout() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  return useMutation({
    mutationFn: async () => {
      return api.post<ApiResponse<null>>('/auth/logout');
    },
    onSuccess: () => {
      logout();
      router.push('/login');
    },
    onError: () => {
      // Even if API call fails, clear local state and redirect
      logout();
      router.push('/login');
    },
  });
}

// Authenticate check
export function useIsAuthenticated() {
  return useAuthStore((state) => state.isAuthenticated);
}

// Get current user
export function useCurrentUser() {
  return useAuthStore((state) => state.user);
}
