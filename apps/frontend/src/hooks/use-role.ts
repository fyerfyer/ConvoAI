import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import {
  ApiResponse,
  CreateRoleDTO,
  UpdateRoleDTO,
  GuildResponse,
  MemberResponse,
} from '@discord-platform/shared';
import { guildKeys } from './use-guild';
import { memberKeys } from './use-member';
import { permissionKeys } from './use-permission';

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      data,
    }: {
      guildId: string;
      data: CreateRoleDTO;
    }) => {
      const response = await api.post<ApiResponse<GuildResponse>>(
        `/guilds/${guildId}/roles`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: guildKeys.detail(variables.guildId),
      });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      roleId,
      data,
    }: {
      guildId: string;
      roleId: string;
      data: UpdateRoleDTO;
    }) => {
      const response = await api.patch<ApiResponse<GuildResponse>>(
        `/guilds/${guildId}/roles/${roleId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: guildKeys.detail(variables.guildId),
      });
      queryClient.invalidateQueries({
        queryKey: permissionKeys.byGuild(variables.guildId),
      });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      roleId,
    }: {
      guildId: string;
      roleId: string;
    }) => {
      const response = await api.delete<ApiResponse<GuildResponse>>(
        `/guilds/${guildId}/roles/${roleId}`,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: guildKeys.detail(variables.guildId),
      });
      queryClient.invalidateQueries({
        queryKey: permissionKeys.byGuild(variables.guildId),
      });
    },
  });
}

export function useAddRoleToMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      userId,
      roleId,
    }: {
      guildId: string;
      userId: string;
      roleId: string;
    }) => {
      const response = await api.post<ApiResponse<MemberResponse>>(
        `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: memberKeys.byGuild(variables.guildId),
      });
    },
  });
}

export function useRemoveRoleFromMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      guildId,
      userId,
      roleId,
    }: {
      guildId: string;
      userId: string;
      roleId: string;
    }) => {
      await api.delete<ApiResponse<MemberResponse>>(
        `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: memberKeys.byGuild(variables.guildId),
      });
    },
  });
}
