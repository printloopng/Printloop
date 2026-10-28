import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { z } from "zod";
import { SOCKET_CLIENT_EVENTS, SOCKET_EVENTS } from "./events";
import { Logger } from "../logger";
import { JwtService } from "../auth/jwt";
import { Config } from "@/config";
import { loadAuthenticatedUserContext } from '@/common/middleware/jwt-user.loader';
import { RedisClient } from "../redis/client";
import { resolveConversationPeer } from "./peer-resolver";

export { SOCKET_EVENTS, SOCKET_CLIENT_EVENTS } from "./events";

declare module "socket.io" {
  interface SocketData {
    userId?: string;
    tokenExp?: number;
  }
}

const socketLogger = new Logger({
  level: Config.logging.level,
  service: "socket-io"
});

let io: Server;

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }
  return Config.allowedOrigins.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const domain = pattern.slice(2);
      try {
        const host = new URL(origin).hostname.toLowerCase();
        return host === domain || host.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    }
    return origin === pattern;
  });
}

const RATE_WINDOW_MS = 10_000;
const RATE_MAX_EVENTS = 200;
const TYPING_MIN_INTERVAL_MS = 1500;
const AUTH_REFRESH_GRACE_MS = 30_000;

const conversationIdSchema = z.object({ conversationId: z.uuid() });
const authRefreshSchema = z.object({ token: z.string().min(10).max(4096) });

let connectHandler: ((userId: string) => void | Promise<void>) | undefined;

export const onUserConnected = (
  handler: (userId: string) => void | Promise<void>
): void => {
  connectHandler = handler;
};

const createEventLimiter = () => {
  let windowStart = Date.now();
  let count = 0;
  return (): boolean => {
    const now = Date.now();
    if (now - windowStart > RATE_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    return ++count <= RATE_MAX_EVENTS;
  };
};

export const initializeSocket = (
  server: HttpServer,
  jwtService: JwtService,
  redis: RedisClient
): void => {
  try {
    io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          const ok = isOriginAllowed(origin);
          callback(null, ok ? origin : false);
        },
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ["websocket"],
      maxHttpBufferSize: 1_000_000,
      pingInterval: 25_000,
      pingTimeout: 20_000
    });

    const pubClient = redis.redis.duplicate();
    const subClient = redis.redis.duplicate();
    pubClient.on("error", (e) => socketLogger.error("Socket adapter pub error", e));
    subClient.on("error", (e) => socketLogger.error("Socket adapter sub error", e));
    io.adapter(createAdapter(pubClient, subClient));

    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) {
          return next(new Error("Unauthorized"));
        }
        const ctx = await loadAuthenticatedUserContext(jwtService, token);
        socket.data.userId = ctx.user.id;
        socket.data.tokenExp = ctx.exp;

        const open = await io.in(`user-${ctx.user.id}`).fetchSockets();
        const maxSockets = 5;
        if (open.length >= maxSockets) {
          return next(new Error("Too many connections"));
        }
        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    });

    io.on("connection", (socket: Socket) => {
      const userId = socket.data.userId as string;
      const allowEvent = createEventLimiter();
      const lastTypingAt = new Map<string, number>();
      let expiryTimer: NodeJS.Timeout | undefined;
      let graceTimer: NodeJS.Timeout | undefined;

      socketLogger.debug(`Client connected: ${socket.id}`);
      socket.join(`user-${userId}`);

      const armExpiry = (expSeconds: number) => {
        if (expiryTimer) clearTimeout(expiryTimer);
        if (graceTimer) clearTimeout(graceTimer);
        const delay = Math.max(0, expSeconds * 1000 - Date.now());
        expiryTimer = setTimeout(() => {
          socket.emit(SOCKET_EVENTS.AUTH_EXPIRED, {});
          graceTimer = setTimeout(() => socket.disconnect(true), AUTH_REFRESH_GRACE_MS);
        }, delay);
      };
      armExpiry(socket.data.tokenExp as number);

      const guard =
        <T,>(handler: (payload: T) => void | Promise<void>) =>
        async (payload: T) => {
          if (!allowEvent()) return;
          try {
            await handler(payload);
          } catch (error) {
            socketLogger.warn("Socket handler failed", {
              message: error instanceof Error ? error.message : String(error)
            });
          }
        };

      socket.on(
        SOCKET_CLIENT_EVENTS.AUTH_REFRESH,
        guard(async (payload: unknown) => {
          const parsed = authRefreshSchema.safeParse(payload);
          if (!parsed.success) return;
          try {
            const ctx = await loadAuthenticatedUserContext(jwtService, parsed.data.token);
            if (ctx.user.id !== userId) throw new Error("User mismatch");
            armExpiry(ctx.exp);
            socket.emit(SOCKET_EVENTS.AUTH_REFRESHED, {});
          } catch {
            socket.disconnect(true);
          }
        })
      );

      socket.on(SOCKET_CLIENT_EVENTS.JOIN, () => undefined);

      socket.on(
        SOCKET_CLIENT_EVENTS.CHAT_TYPING,
        guard(async (payload: unknown) => {
          const parsed = conversationIdSchema.safeParse(payload);
          if (!parsed.success) return;
          const { conversationId } = parsed.data;

          const now = Date.now();
          if (now - (lastTypingAt.get(conversationId) ?? 0) < TYPING_MIN_INTERVAL_MS) return;
          lastTypingAt.set(conversationId, now);

          const peerId = await resolveConversationPeer(userId, conversationId);
          if (!peerId) return;
          notifyUser(peerId, SOCKET_EVENTS.TYPING, { conversationId, senderId: userId });
        })
      );

      socket.on(SOCKET_CLIENT_EVENTS.DISCONNECT, () => {
        if (expiryTimer) clearTimeout(expiryTimer);
        if (graceTimer) clearTimeout(graceTimer);
        socketLogger.debug(`Client disconnected: ${socket.id}`);
      });

      Promise.resolve(connectHandler?.(userId)).catch((error) =>
        socketLogger.warn("Connect handler failed", {
          message: error instanceof Error ? error.message : String(error)
        })
      );
    });
  } catch (error) {
    socketLogger.error(
      "Socket initialization failed",
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

export const closeSocket = async (): Promise<void> => {
  const ioInstance = getIo();
  if (!ioInstance) return;
  ioInstance.disconnectSockets(true);
  await new Promise<void>((resolve) => ioInstance.close(() => resolve()));
};

export const isUserOnline = async (userId: string): Promise<boolean> => {
  const ioInstance = getIo();
  if (!ioInstance) return false;
  const sockets = await ioInstance.in(`user-${userId}`).fetchSockets();
  return sockets.length > 0;
};

export const getIo = (): Server | undefined => io;

export const notifyUser = (userId: string, event: string, data: any): void => {
  const ioInstance = getIo();
  if (ioInstance) {
    socketLogger.debug(`Emitting event '${event}' to user '${userId}'`, {
      hasPayload: data != null
    });
    ioInstance.to(`user-${userId}`).emit(event, data);
  }
};

export const notifyMultipleUsers = (
  userIds: string[],
  event: string,
  data: any
): void => {
  const ioInstance = getIo();
  if (ioInstance) {
    userIds.forEach((userId) => {
      ioInstance.to(`user-${userId}`).emit(event, data);
    });
  }
};

export const notifyAll = (event: string, data: any): void => {
  const ioInstance = getIo();
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
};

export const isUserConnected = (userId: string): boolean => {
  const ioInstance = getIo();
  if (ioInstance) {
    const room = ioInstance.sockets.adapter.rooms.get(`user-${userId}`);
    return room !== undefined && room.size > 0;
  }
  return false;
};

export const getUsersInRoom = (room: string): string[] => {
  const ioInstance = getIo();
  if (ioInstance) {
    const roomSet = ioInstance.sockets.adapter.rooms.get(room);
    return roomSet ? Array.from(roomSet) : [];
  }
  return [];
};

export const getConnectedSockets = (): string[] => {
  const ioInstance = getIo();
  if (ioInstance) {
    return Array.from(ioInstance.sockets.sockets.keys());
  }
  return [];
};

export const broadcastToRoom = (
  room: string,
  event: string,
  data: any,
  excludeSocketId: string
): void => {
  const ioInstance = getIo();
  if (ioInstance) {
    ioInstance.to(room).except(excludeSocketId).emit(event, data);
  }
};

export const disconnectSocket = (socketId: string): void => {
  const ioInstance = getIo();
  if (ioInstance) {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect();
    }
  }
};

export const disconnectUser = (userId: string): void => {
  const ioInstance = getIo();
  if (ioInstance) {
    ioInstance.in(`user-${userId}`).disconnectSockets(true);
  }
};

export const getConnectedCount = (): number => {
  const ioInstance = getIo();
  if (ioInstance) {
    return ioInstance.sockets.sockets.size;
  }
  return 0;
};

export const getRoomSize = (room: string): number => {
  const ioInstance = getIo();
  if (ioInstance) {
    const roomSet = ioInstance.sockets.adapter.rooms.get(room);
    return roomSet ? roomSet.size : 0;
  }
  return 0;
};
