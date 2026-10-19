import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { EditorSessionStatus } from '@/database/entities/editorSession.entity';
import { config } from '@/config';

type RtcSdp = { type: string; sdp?: string };
type RtcIce = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };

interface SignalingData {
  offer?: RtcSdp;
  answer?: RtcSdp;
  candidate?: RtcIce;
}

interface AwarenessState {
  userId: string;
  role: 'shop' | 'customer';
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

export class EditorCollaborationService {
  private io: SocketIOServer | null = null;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private rooms: Map<string, SessionRoom> = new Map();
  private userSockets: Map<string, { sessionId: string; role: 'shop' | 'customer' }> = new Map();

  
  async initialize(httpServer: HttpServer): Promise<void> {
    const redisUrl = config.redis?.url || 'redis://localhost:6379';
    this.redisClient = createClient({ url: redisUrl });
    this.redisClient.on('error', (err) => console.error('[EditorCollab] Redis error:', err));
    await this.redisClient.connect();

    const pubClient = this.redisClient.duplicate();
    await pubClient.connect();

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.frontendUrl || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.io.adapter(createAdapter(this.redisClient, pubClient));

    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }
        const payload = this.verifyToken(token as string);
        socket.data.user = payload;
        next();
      } catch (err) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => this.handleConnection(socket));

    console.log('[EditorCollab] Socket.io server initialized');
  }

  
  private handleConnection(socket: Socket): void {
    const { userId, sessionId, role } = socket.data.user;

    console.log(`[EditorCollab] User ${userId} (${role}) connected to session ${sessionId}`);

    socket.join(sessionId);
    this.userSockets.set(socket.id, { sessionId, role });

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

    if (role === 'shop') {
      room.shopSocketId = socket.id;
    } else {
      room.customerSocketId = socket.id;
    }

    socket.emit('room-state', {
      sessionId,
      role,
      documentVersion: room.documentVersion,
      peerAwareness: role === 'shop' ? room.customerAwareness : room.shopAwareness,
      peerConnected: role === 'shop' ? !!room.customerSocketId : !!room.shopSocketId,
    });

    const peerSocketId = role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (peerSocketId) {
      this.io?.to(peerSocketId).emit('peer-joined', { role });
    }

    socket.on('offer', (data) => this.handleOffer(socket, data));
    socket.on('answer', (data) => this.handleAnswer(socket, data));
    socket.on('ice-candidate', (data) => this.handleIceCandidate(socket, data));
    socket.on('awareness', (data) => this.handleAwareness(socket, data));
    socket.on('snapshot', (data) => this.handleSnapshot(socket, data));
    socket.on('document-version', (data) => this.handleDocumentVersion(socket, data));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  
  private handleOffer(socket: Socket, data: { sessionId: string; offer: RtcSdp }): void {
    const room = this.rooms.get(data.sessionId);
    if (!room) return;

    const targetSocketId = socket.data.user.role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (targetSocketId) {
      this.io?.to(targetSocketId).emit('offer', {
        offer: data.offer,
        fromRole: socket.data.user.role,
      });
    }
  }

  
  private handleAnswer(socket: Socket, data: { sessionId: string; answer: RtcSdp }): void {
    const room = this.rooms.get(data.sessionId);
    if (!room) return;

    const targetSocketId = socket.data.user.role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (targetSocketId) {
      this.io?.to(targetSocketId).emit('answer', {
        answer: data.answer,
        fromRole: socket.data.user.role,
      });
    }
  }

  
  private handleIceCandidate(socket: Socket, data: { sessionId: string; candidate: RtcIce }): void {
    const room = this.rooms.get(data.sessionId);
    if (!room) return;

    const targetSocketId = socket.data.user.role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (targetSocketId) {
      this.io?.to(targetSocketId).emit('ice-candidate', {
        candidate: data.candidate,
        fromRole: socket.data.user.role,
      });
    }
  }

  
  private handleAwareness(socket: Socket, awareness: AwarenessState): void {
    const { sessionId, role } = socket.data.user;
    const room = this.rooms.get(sessionId);
    if (!room) return;

    if (role === 'shop') {
      room.shopAwareness = awareness;
    } else {
      room.customerAwareness = awareness;
    }

    const targetSocketId = role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (targetSocketId) {
      this.io?.to(targetSocketId).emit('awareness', awareness);
    }
  }

  
  private handleSnapshot(socket: Socket, data: { sessionId: string; snapshot: any; version: number }): void {
    const room = this.rooms.get(data.sessionId);
    if (!room) return;

    room.documentVersion = data.version;

    const targetSocketId = socket.data.user.role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (targetSocketId) {
      this.io?.to(targetSocketId).emit('snapshot', {
        snapshot: data.snapshot,
        version: data.version,
        fromRole: socket.data.user.role,
      });
    }
  }

  
  private handleDocumentVersion(socket: Socket, data: { sessionId: string; version: number }): void {
    const room = this.rooms.get(data.sessionId);
    if (!room) return;

    room.documentVersion = data.version;

    const targetSocketId = socket.data.user.role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (targetSocketId) {
      this.io?.to(targetSocketId).emit('document-version', { version: data.version });
    }
  }

  
  private handleDisconnect(socket: Socket): void {
    const userData = this.userSockets.get(socket.id);
    if (!userData) return;

    const { sessionId, role } = userData;
    const room = this.rooms.get(sessionId);
    if (!room) return;

    console.log(`[EditorCollab] User ${socket.data.user.userId} (${role}) disconnected from session ${sessionId}`);

    if (role === 'shop') {
      room.shopSocketId = null;
      room.shopAwareness = null;
    } else {
      room.customerSocketId = null;
      room.customerAwareness = null;
    }

    const peerSocketId = role === 'shop' ? room.customerSocketId : room.shopSocketId;
    if (peerSocketId) {
      this.io?.to(peerSocketId).emit('peer-left', { role });
    }

    if (!room.shopSocketId && !room.customerSocketId) {
      setTimeout(() => {
        const currentRoom = this.rooms.get(sessionId);
        if (currentRoom && !currentRoom.shopSocketId && !currentRoom.customerSocketId) {
          this.rooms.delete(sessionId);
          console.log(`[EditorCollab] Cleaned up empty room ${sessionId}`);
        }
      }, 60000); // 1 minute grace period
    }

    this.userSockets.delete(socket.id);
  }

  
  private verifyToken(token: string): { userId: string; sessionId: string; role: 'shop' | 'customer' } {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64url').toString());
      return {
        userId: payload.uid,
        sessionId: payload.sid,
        role: payload.role || 'shop',
      };
    } catch {
      throw new Error('Invalid token format');
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

    if (room.shopSocketId) {
      this.io?.sockets.sockets.get(room.shopSocketId)?.disconnect();
    }
    if (room.customerSocketId) {
      this.io?.sockets.sockets.get(room.customerSocketId)?.disconnect();
    }

    this.rooms.delete(sessionId);
    return true;
  }

  
  async shutdown(): Promise<void> {
    if (this.io) {
      await this.io.close();
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    console.log('[EditorCollab] Server shutdown complete');
  }
}

export const editorCollaborationService = new EditorCollaborationService();