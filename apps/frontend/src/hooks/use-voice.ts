'use client';

import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  LocalParticipant,
} from 'livekit-client';
import { api } from '../lib/api-client';
import { useVoiceStore } from '../stores/voice-store';
import { useSocket } from './use-socket';
import {
  ApiResponse,
  SOCKET_EVENT,
  VoiceTokenResponse,
} from '@discord-platform/shared';

// Get voice token from backend
export function useVoiceToken() {
  return useMutation({
    mutationFn: async (channelId: string) => {
      const response = await api.post<ApiResponse<VoiceTokenResponse>>(
        `/voice/token/${channelId}`,
      );
      return response.data;
    },
  });
}

// Main voice hook for managing voice channel connection
export function useVoice() {
  const roomRef = useRef<Room | null>(null);
  const voiceToken = useVoiceToken();
  const {
    activeChannelId,
    setActiveChannel,
    addParticipant,
    removeParticipant,
    updateParticipant,
    setMuted,
    setDeafened,
    setConnecting,
    disconnect: disconnectStore,
    isMuted,
    isDeafened,
  } = useVoiceStore();

  const { socket } = useSocket();

  const joinVoiceChannel = useCallback(
    async (channelId: string, guildId: string) => {
      // If already in a channel, disconnect first
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }

      setConnecting(true);

      try {
        // Get LiveKit token from backend
        const tokenData = await voiceToken.mutateAsync(channelId);

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        // Set up event handlers
        room.on(
          RoomEvent.ParticipantConnected,
          (participant: RemoteParticipant) => {
            addParticipant({
              userId: participant.identity,
              name: participant.name || participant.identity,
              avatar: null,
              isMuted: false,
              isSpeaking: false,
            });
          },
        );

        room.on(
          RoomEvent.ParticipantDisconnected,
          (participant: RemoteParticipant) => {
            removeParticipant(participant.identity);
          },
        );

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const speakerIds = new Set(speakers.map((s) => s.identity));
          const allParticipants = useVoiceStore.getState().participants;
          allParticipants.forEach((p) => {
            updateParticipant(p.userId, {
              isSpeaking: speakerIds.has(p.userId),
            });
          });
        });

        room.on(RoomEvent.TrackMuted, (publication, participant) => {
          if (publication.kind === Track.Kind.Audio) {
            updateParticipant(participant.identity, { isMuted: true });
          }
        });

        room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
          if (publication.kind === Track.Kind.Audio) {
            updateParticipant(participant.identity, { isMuted: false });
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          disconnectStore();
          roomRef.current = null;
        });

        // Connect to the room
        if (!tokenData) {
          throw new Error('Invalid token data');
        }

        await room.connect(tokenData.url, tokenData.token);

        // Enable microphone
        await room.localParticipant.setMicrophoneEnabled(true);

        roomRef.current = room;

        // Add existing participants
        room.remoteParticipants.forEach((participant: RemoteParticipant) => {
          addParticipant({
            userId: participant.identity,
            name: participant.name || participant.identity,
            avatar: null,
            isMuted: false,
            isSpeaking: false,
          });
        });

        // Add self as participant
        const localParticipant: LocalParticipant = room.localParticipant;
        addParticipant({
          userId: localParticipant.identity,
          name: localParticipant.name || localParticipant.identity,
          avatar: null,
          isMuted: false,
          isSpeaking: false,
        });

        setActiveChannel(channelId, guildId);

        // Notify via socket
        if (socket?.connected) {
          socket.emit(SOCKET_EVENT.VOICE_JOIN, { channelId });
        }
      } catch (error) {
        console.error('[Voice] Failed to join voice channel:', error);
        disconnectStore();
        throw error;
      } finally {
        setConnecting(false);
      }
    },
    [
      voiceToken,
      socket,
      addParticipant,
      removeParticipant,
      updateParticipant,
      setActiveChannel,
      setConnecting,
      disconnectStore,
    ],
  );

  const leaveVoiceChannel = useCallback(() => {
    if (roomRef.current) {
      // Notify via socket before disconnecting
      if (socket?.connected && activeChannelId) {
        socket.emit(SOCKET_EVENT.VOICE_LEAVE, { channelId: activeChannelId });
      }

      roomRef.current.disconnect();
      roomRef.current = null;
    }
    disconnectStore();
  }, [socket, activeChannelId, disconnectStore]);

  const toggleMute = useCallback(() => {
    if (roomRef.current) {
      const newMuted = !isMuted;
      roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setMuted(newMuted);
    }
  }, [isMuted, setMuted]);

  const toggleDeafen = useCallback(() => {
    if (roomRef.current) {
      const newDeafened = !isDeafened;
      // Mute all remote audio tracks
      roomRef.current.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            if (newDeafened) {
              pub.track.detach();
            } else {
              pub.track.attach();
            }
          }
        });
      });
      setDeafened(newDeafened);
      // If deafening, also mute mic
      if (newDeafened && !isMuted) {
        roomRef.current.localParticipant.setMicrophoneEnabled(false);
        setMuted(true);
      }
    }
  }, [isDeafened, isMuted, setDeafened, setMuted]);

  return {
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    room: roomRef.current,
  };
}
