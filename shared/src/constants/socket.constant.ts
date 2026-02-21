export const SOCKET_EVENT = {
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  HEARTBEAT: 'heartbeat',
  SEND_MESSAGE: 'sendMessage',
  NEW_MESSAGE: 'newMessage',
  TYPING: 'typing',
  BOT_STREAM_START: 'botStreamStart',
  BOT_STREAM_CHUNK: 'botStreamChunk',
  BOT_STREAM_END: 'botStreamEnd',
  VOICE_JOIN: 'voiceJoin',
  VOICE_LEAVE: 'voiceLeave',
  VOICE_STATE_UPDATE: 'voiceStateUpdate',
  VOICE_PARTICIPANTS: 'voiceParticipants',
} as const;

export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];
