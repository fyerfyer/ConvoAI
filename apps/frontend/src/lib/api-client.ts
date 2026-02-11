import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

export interface ApiErrorResponse {
  error?: string;
  message?: string;
  statusCode: number;
}

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

apiClient.interceptors.request.use(
  (config) => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('discord_token')
        : null;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response) {
      const apiError: ApiErrorResponse = {
        error: error.response.data?.error || 'An error occurred',
        message: error.response.data?.message || error.message,
        statusCode: error.response.status,
      };

      if (error.response.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('discord_token');
          localStorage.removeItem('discord_user');
          if (
            !window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/register')
          ) {
            window.location.href = '/login';
          }
        }
      }

      return Promise.reject(apiError);
    } else if (error.request) {
      return Promise.reject({
        error: 'Network Error',
        message: 'No response from server. Please check your connection.',
        statusCode: 0,
      });
    } else {
      return Promise.reject({
        error: 'Request Error',
        message: error.message,
        statusCode: 0,
      });
    }
  },
);

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<T>(config);
  return response.data;
}
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'GET', url }),

  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'POST', url, data }),

  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'PATCH', url, data }),

  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'PUT', url, data }),

  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'DELETE', url }),
};

export default apiClient;
