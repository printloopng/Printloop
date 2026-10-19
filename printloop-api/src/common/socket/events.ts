export const SOCKET_CLIENT_EVENTS = {
  JOIN: "join",
  CHAT_TYPING: "chat:typing",
  AUTH_REFRESH: "auth:refresh",
  DISCONNECT: "disconnect"
} as const;

export const SOCKET_EVENTS = {
  NEW_NOTIFICATION: "notification:new",

  MESSAGE_NEW: "chat:message:new",
  MESSAGE_DELETED: "chat:message:deleted",
  MESSAGE_DELIVERED: "chat:message:delivered",
  MESSAGES_READ: "chat:messages:read",
  TYPING: "chat:typing",

  CALL_INCOMING: "call:incoming",
  CALL_ACCEPTED: "call:accepted",
  CALL_END: "call:end",
  CALL_REJECT: "call:reject",

  AUTH_EXPIRED: "auth:expired",
  AUTH_REFRESHED: "auth:refreshed",

  ERROR: "error"
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
export type SocketClientEvent =
  (typeof SOCKET_CLIENT_EVENTS)[keyof typeof SOCKET_CLIENT_EVENTS];
