import { Server as HttpServer } from 'http';
import { verifyEditorToken } from '@/core/utils/editorToken';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { EditorSession } from '@/database/entities/editorSession.entity';
import { AppDataSource } from '@/config/data-source';
import { Config } from '@/config';
import { isAllowedOrigin } from '@/config/origins';

type Role = 'shop' | 'customer';
type RtcSdp = { type: string; sdp?: string };
type RtcIce = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };

interface AwarenessState {
  userId: string;
  role: Role;
  userName: string;
  color: string;
  cursor?: { x: number; y: number; page: number };
  selection?: { start: number; end: number; page: number };
  presence: 'editing' | 'viewing' | 'idle';
  lastActive: number;
}

interface SessionRoom {
  sessionId: string;
  shopSocketId: string | null;
  customerSocketId: string | null;
  shopAwareness: AwarenessState | null;
  customerAwareness: AwarenessState | null;
  documentVersion: number;
}

interface EditorClaims {
  userId: string;
  sessionId: string;
  role: Role;
}

export class EditorCollaborationService {
  private io: SocketIOServer | null = null;
  private redisClients: Array<ReturnType<typeof createClient>> = [];
  private rooms: Map<string, SessionRoom> = new Map();

  async initialize(httpServer: HttpServer): Promise<void> {
    this.io = new SocketIOServer(httpServer, {
      path: '/editor-socket',
      cors: {
        origin: (origin, callback) => callback(null, origin && isAllowedOrigin(origin) ? origin : false),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 5_000_000,
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    if (Config.redis.enabled && Config.redis.url) {
      try {
        const pub = createClient({ url: Config.redis.url });
        const sub = pub.duplicate();
        pub.on('error', (err) => console.error('[EditorCollab] Redis error:', err));
        sub.on('error', (err) => console.error('[EditorCollab] Redis error:', err));
        await Promise.all([pub.connect(), sub.connect()]);
        this.redisClients = [pub, sub];
        this.io.adapter(createAdapter(pub, sub));
      } catch (err) {
        console.error('[EditorCollab] Redis adapter unavailable, using in-memory rooms:', err);
      }
    }

    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token || typeof token !== 'string') return next(new Error('Authentication required'));
        const claims = verifyEditorToken(token);
        const session = await AppDataSource.getRepository(EditorSession).findOne({ where: { id: claims.sessionId } });
        if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
          return next(new Error('Session expired'));
        }
        socket.data.user = { userId: claims.userId, sessionId: claims.sessionId, role: claims.role } satisfies EditorClaims;
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  private claims(socket: Socket): EditorClaims {
    return socket.data.user as EditorClaims;
  }

  private peerOf(socket: Socket): string | null {
    const { sessionId, role } = this.claims(socket);
    const room = this.rooms.get(sessionId);
    if (!room) return null;
    return role === 'shop' ? room.customerSocketId : room.shopSocketId;
  }

  private relay(socket: Socket, event: string, payload: unknown): void {
    const target = this.peerOf(socket);
    if (target) this.io?.to(target).emit(event, payload);
  }

  private handleConnection(socket: Socket): void {
    const { sessionId, role } = this.claims(socket);
    socket.join(sessionId);

    let room = this.rooms.get(sessionId);
    if (!room) {
      room = {
        sessionId,
        shopSocketId: null,
        customerSocketId: null,
        shopAwareness: null,
        customerAwareness: null,
        documentVersion: 0,
      };
      this.rooms.set(sessionId, room);
    }

    const previous = role === 'shop' ? room.shopSocketId : room.customerSocketId;
    if (previous && previous !== socket.id) this.io?.sockets.sockets.get(previous)?.disconnect(true);
    if (role === 'shop') room.shopSocketId = socket.id;
    else room.customerSocketId = socket.id;

    socket.emit('room-state', {
      sessionId,
      role,
      documentVersion: room.documentVersion,
      peerAwareness: role === 'shop' ? room.customerAwareness : room.shopAwareness,
      peerConnected: role === 'shop' ? !!room.customerSocketId : !!room.shopSocketId,
    });
    this.relay(socket, 'peer-joined', { role });

    socket.on('offer', (data: { offer?: RtcSdp }) => this.relay(socket, 'offer', { offer: data?.offer, fromRole: role }));
    socket.on('answer', (data: { answer?: RtcSdp }) => this.relay(socket, 'answer', { answer: data?.answer, fromRole: role }));
    socket.on('ice-candidate', (data: { candidate?: RtcIce }) =>
      this.relay(socket, 'ice-candidate', { candidate: data?.candidate, fromRole: role }),
    );
    socket.on('awareness', (data: AwarenessState) => this.handleAwareness(socket, data));
    socket.on('snapshot', (data: { snapshot: unknown; version: number }) => this.handleSnapshot(socket, data));
    socket.on('document-version', (data: { version: number }) => this.handleDocumentVersion(socket, data));
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private handleAwareness(socket: Socket, awareness: AwarenessState): void {
    const { sessionId, role, userId } = this.claims(socket);
    const room = this.rooms.get(sessionId);
    if (!room || !awareness || typeof awareness !== 'object') return;
    const state: AwarenessState = { ...awareness, userId, role, lastActive: Date.now() };
    if (role === 'shop') room.shopAwareness = state;
    else room.customerAwareness = state;
    this.relay(socket, 'awareness', state);
  }

  private handleSnapshot(socket: Socket, data: { snapshot: unknown; version: number }): void {
    const { sessionId, role } = this.claims(socket);
    const room = this.rooms.get(sessionId);
    if (!room || role !== 'shop' || !Number.isFinite(data?.version)) return;
    room.documentVersion = data.version;
    this.relay(socket, 'snapshot', { snapshot: data.snapshot, version: data.version, fromRole: role });
  }

  private handleDocumentVersion(socket: Socket, data: { version: number }): void {
    const { sessionId, role } = this.claims(socket);
    const room = this.rooms.get(sessionId);
    if (!room || role !== 'shop' || !Number.isFinite(data?.version)) return;
    room.documentVersion = data.version;
    this.relay(socket, 'document-version', { version: data.version });
  }

  private handleDisconnect(socket: Socket): void {
    const { sessionId, role } = this.claims(socket);
    const room = this.rooms.get(sessionId);
    if (!room) return;
    const current = role === 'shop' ? room.shopSocketId : room.customerSocketId;
    if (current !== socket.id) return;

    if (role === 'shop') {
      room.shopSocketId = null;
      room.shopAwareness = null;
    } else {
      room.customerSocketId = null;
      room.customerAwareness = null;
    }
    this.relay(socket, 'peer-left', { role });

    if (!room.shopSocketId && !room.customerSocketId) {
      setTimeout(() => {
        const currentRoom = this.rooms.get(sessionId);
        if (currentRoom && !currentRoom.shopSocketId && !currentRoom.customerSocketId) {
          this.rooms.delete(sessionId);
        }
      }, 60000).unref?.();
    }
  }

  getRoomInfo(sessionId: string): SessionRoom | null {
    return this.rooms.get(sessionId) || null;
  }

  getActiveSessionsCount(): number {
    return this.rooms.size;
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const room = this.rooms.get(sessionId);
    if (!room) return false;
    this.io?.to(sessionId).emit('session-closed', { reason: 'closed_by_admin' });
    for (const id of [room.shopSocketId, room.customerSocketId]) {
      if (id) this.io?.sockets.sockets.get(id)?.disconnect();
    }
    this.rooms.delete(sessionId);
    return true;
  }

  async shutdown(): Promise<void> {
    if (this.io) await this.io.close();
    await Promise.all(this.redisClients.map((c) => c.quit().catch(() => undefined)));
  }
}

export const editorCollaborationService = new EditorCollaborationService();
