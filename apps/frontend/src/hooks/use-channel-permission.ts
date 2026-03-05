import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import {
  ApiResponse,
  ChannelResponse,
  PermissionOverwriteDTO,
} from '@discord-platform/shared';
import { channelKeys } from './use-channel';
import { permissionKeys } from './use-permission';

// Calls PUT /channels/:channelId/permissions
export function useSetChannelPermissionOverwrite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      guildId,
      data,
    }: {
      channelId: string;
      guildId: string;
      data: PermissionOverwriteDTO;
    }) => {
      const response = await api.put<ApiResponse<ChannelResponse>>(
        `/channels/${channelId}/permissions?guildId=${guildId}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: channelKeys.byGuild(variables.guildId),
      });
      queryClient.invalidateQueries({
        queryKey: permissionKeys.byGuild(variables.guildId),
      });
    },
  });
}
