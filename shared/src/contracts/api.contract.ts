import z from 'zod';
import { loginSchema, registerSchema } from '../dtos/auth.dto';
import { updateUserSchema } from '../dtos/user.dto';
import { createGuildSchema } from '../dtos/guild.dto';
import { ApiResponse } from '../interfaces/api.interface';
import {
  AuthResponse,
  UserResponse,
  GuildResponse,
  GuildListResponse,
} from '../interfaces/response.interface';

/**
 * Unified API Contract Definition
 * This file defines all API endpoints with their request/response types
 */

export const ApiContracts = {
  // ==================== Auth Endpoints ====================
  auth: {
    login: {
      method: 'POST' as const,
      path: '/auth/login',
      body: loginSchema,
      response: {} as ApiResponse<AuthResponse>,
    },

    register: {
      method: 'POST' as const,
      path: '/auth/register',
      body: registerSchema,
      response: {} as ApiResponse<AuthResponse>,
    },

    logout: {
      method: 'POST' as const,
      path: '/auth/logout',
      response: {} as ApiResponse<null>,
    },
  },

  // ==================== User Endpoints ====================
  user: {
    getProfile: {
      method: 'GET' as const,
      path: '/users/me',
      response: {} as ApiResponse<UserResponse>,
      requiresAuth: true,
    },

    updateProfile: {
      method: 'PATCH' as const,
      path: '/users/me',
      body: updateUserSchema,
      response: {} as ApiResponse<UserResponse>,
      requiresAuth: true,
    },

    getUserById: {
      method: 'GET' as const,
      path: '/users/:id',
      params: z.object({ id: z.string() }),
      response: {} as ApiResponse<UserResponse>,
      requiresAuth: true,
    },
  },

  // ==================== Guild Endpoints ====================
  guild: {
    createGuild: {
      method: 'POST' as const,
      path: '/guilds',
      body: createGuildSchema,
      response: {} as ApiResponse<GuildResponse>,
      requiresAuth: true,
    },

    getGuild: {
      method: 'GET' as const,
      path: '/guilds/:guildId',
      params: z.object({ guildId: z.string() }),
      response: {} as ApiResponse<GuildResponse>,
      requiresAuth: true,
    },

    getUserGuilds: {
      method: 'GET' as const,
      path: '/guilds',
      response: {} as ApiResponse<GuildListResponse>,
      requiresAuth: true,
    },
  },
} as const;

// ==================== Type Helpers ====================

export type ApiContract = typeof ApiContracts;

// Extract request body type
export type ApiRequestBody<T extends { body?: z.ZodType<any> }> = T extends {
  body: z.ZodType<infer U>;
}
  ? U
  : never;

// Extract response type
export type ApiResponseType<T extends { response: any }> = T['response'];

// Extract params type
export type ApiParams<T extends { params?: z.ZodType<any> }> = T extends {
  params: z.ZodType<infer U>;
}
  ? U
  : never;
