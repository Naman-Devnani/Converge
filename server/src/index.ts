import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import {
  getSession,
  getOrCreateSession,
  addParticipant,
  updateLocation,
  removeParticipant,
  setParticipantOnline,
  setHost,
  isHost,
  endSession,
  addMessage,
  validatePassword,
  type SessionConfig,
} from './sessions';

const app    = express();
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({ origin: isProd ? false : '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: isProd ? {} : { origin: '*', methods: ['GET', 'POST'] },
});

const socketSession    = new Map<string, string>();
const locationThrottle = new Map<string, number>();
const chatThrottle     = new Map<string, number>();
const offlineTimers    = new Map<string, ReturnType<typeof setTimeout>>();
const LOCATION_MIN_MS  = 2000;
const CHAT_MIN_MS      = 1000;
const OFFLINE_GRACE_MS = 30_000;

// ── REST ──────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json({
    id:               session.id,
    name:             session.name,
    participantCount: Object.keys(session.participants).length,
    createdAt:        session.createdAt,
    expiresAt:        session.expiresAt,
    hasPassword:      session.passwordHash !== null,
    maxParticipants:  session.maxParticipants,
  });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  socket.on('join-session', ({
    sessionId, name, password, config,
  }: {
    sessionId: string;
    name: string;
    password?: string;
    config?: SessionConfig;
  }) => {
    if (!sessionId || typeof sessionId !== 'string') {
      socket.emit('error', { message: 'Invalid session ID' }); return;
    }
    if (typeof name !== 'string') {
      socket.emit('error', { message: 'Invalid name' }); return;
    }

    const session = getOrCreateSession(sessionId, config);

    if (Date.now() > session.expiresAt) {
      socket.emit('error', { message: 'Session has expired', code: 'SESSION_EXPIRED' }); return;
    }

    // Password validation (guests only — host passes config)
    if (session.passwordHash && !config) {
      if (!validatePassword(sessionId, password ?? '')) {
        socket.emit('error', { message: 'Incorrect password', code: 'WRONG_PASSWORD' }); return;
      }
    }

    if (Object.keys(session.participants).length >= session.maxParticipants) {
      socket.emit('error', { message: 'Session is full', code: 'SESSION_FULL' }); return;
    }

    const participant = addParticipant(sessionId, socket.id, name);
    if (!participant) { socket.emit('error', { message: 'Could not join session' }); return; }

    socket.join(sessionId);
    socketSession.set(socket.id, sessionId);

    // First joiner with config is the host
    if (config) setHost(sessionId, socket.id);

    const isSessionHost = isHost(sessionId, socket.id);

    socket.emit('session-joined', {
      sessionId,
      myId:         socket.id,
      participants: Object.values(session.participants),
      expiresAt:    session.expiresAt,
      sessionName:  session.name,
      messages:     session.messages,
      isHost:       isSessionHost,
      hostId:       session.hostSocketId,
    });

    socket.to(sessionId).emit('participant-joined', { participant });
  });

  socket.on('location-update', ({ lat, lng, accuracy, heading, speed }: {
    lat: number; lng: number;
    accuracy?: number; heading?: number; speed?: number;
  }) => {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;

    if (typeof lat !== 'number' || typeof lng !== 'number'
        || lat < -90 || lat > 90 || lng < -180 || lng > 180
        || !isFinite(lat) || !isFinite(lng)) return;

    const last = locationThrottle.get(socket.id) ?? 0;
    if (Date.now() - last < LOCATION_MIN_MS) return;
    locationThrottle.set(socket.id, Date.now());

    const participant = updateLocation(
      sessionId, socket.id, lat, lng,
      accuracy ?? null, heading ?? null, speed ?? null,
    );
    if (!participant) return;
    io.to(sessionId).emit('participant-moved', { participant });
  });

  socket.on('chat-message', ({ text }: { text: string }) => {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;

    const lastChat = chatThrottle.get(socket.id) ?? 0;
    if (Date.now() - lastChat < CHAT_MIN_MS) return;
    chatThrottle.set(socket.id, Date.now());

    const session = getSession(sessionId);
    if (!session) return;
    const participant = session.participants[socket.id];
    if (!participant) return;

    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;

    const message = addMessage(sessionId, {
      participantId:   socket.id,
      participantName: participant.name,
      color:           participant.color,
      text:            trimmed,
    });
    if (!message) return;
    io.to(sessionId).emit('chat-message', { message });
  });

  function handleLeave(immediate: boolean) {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;

    socketSession.delete(socket.id);
    locationThrottle.delete(socket.id);
    chatThrottle.delete(socket.id);
    socket.leave(sessionId);

    // Cancel any pending offline timer for this socket
    const existing = offlineTimers.get(socket.id);
    if (existing) { clearTimeout(existing); offlineTimers.delete(socket.id); }

    if (immediate) {
      removeParticipant(sessionId, socket.id);
      io.to(sessionId).emit('participant-left', { participantId: socket.id });
    } else {
      // Mark offline, broadcast status, then remove after grace period
      setParticipantOnline(sessionId, socket.id, false);
      io.to(sessionId).emit('participant-status', { participantId: socket.id, online: false });

      const timer = setTimeout(() => {
        removeParticipant(sessionId, socket.id);
        io.to(sessionId).emit('participant-left', { participantId: socket.id });
        offlineTimers.delete(socket.id);
      }, OFFLINE_GRACE_MS);
      offlineTimers.set(socket.id, timer);
    }
  }

  socket.on('end-session', () => {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;
    if (!isHost(sessionId, socket.id)) {
      socket.emit('error', { message: 'Only the host can end the session' }); return;
    }
    io.to(sessionId).emit('session-ended');
    endSession(sessionId);
  });

  socket.on('leave-session', () => handleLeave(true));
  socket.on('disconnect',    () => handleLeave(false));
});

// ── Static (production) ───────────────────────────────────────────────────────

if (isProd) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () =>
  console.log(`MeetSync server → http://localhost:${PORT} [${isProd ? 'production' : 'development'}]`),
);
