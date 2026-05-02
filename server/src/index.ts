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
} from './sessions';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({ origin: isProd ? false : '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: isProd ? {} : { origin: '*', methods: ['GET', 'POST'] },
});

// socket.id → sessionId
const socketSession = new Map<string, string>();

// ── REST ──────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json({
    id: session.id,
    participantCount: Object.keys(session.participants).length,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('join-session', ({ sessionId, name }: { sessionId: string; name: string }) => {
    if (!sessionId || typeof sessionId !== 'string') {
      socket.emit('error', { message: 'Invalid session ID' });
      return;
    }
    const session     = getOrCreateSession(sessionId);
    const participant = addParticipant(sessionId, socket.id, name);
    if (!participant) { socket.emit('error', { message: 'Could not join session' }); return; }

    socket.join(sessionId);
    socketSession.set(socket.id, sessionId);

    socket.emit('session-joined', {
      sessionId,
      myId: socket.id,
      participants: Object.values(session.participants),
    });
    socket.to(sessionId).emit('participant-joined', { participant });
  });

  socket.on('location-update', ({
    lat, lng, accuracy, heading, speed,
  }: { lat: number; lng: number; accuracy?: number; heading?: number; speed?: number }) => {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;
    const participant = updateLocation(
      sessionId, socket.id, lat, lng,
      accuracy ?? null, heading ?? null, speed ?? null,
    );
    if (!participant) return;
    io.to(sessionId).emit('participant-moved', { participant });
  });

  function handleLeave() {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;
    removeParticipant(sessionId, socket.id);
    socketSession.delete(socket.id);
    io.to(sessionId).emit('participant-left', { participantId: socket.id });
    socket.leave(sessionId);
  }

  socket.on('leave-session', handleLeave);
  socket.on('disconnect', handleLeave);
});

// ── Static client (production) ────────────────────────────────────────────────
// __dirname = server/dist in production after tsc build
if (isProd) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`MeetSync server → http://localhost:${PORT} [${isProd ? 'production' : 'development'}]`);
});
