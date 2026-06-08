import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import {
  getSession,
  getOrCreateSession,
  addParticipant,
  findParticipantByClientId,
  updateLocation,
  removeParticipant,
  setParticipantOnline,
  setHost,
  reclaimHost,
  isHost,
  endSession,
  addMessage,
  updateVenuePoints,
  verifyPasswordAsync,
  type SessionConfig,
} from './sessions';
import type { VenuePoint } from './types';

const app    = express();
const isProd = process.env.NODE_ENV === 'production';

// SEC-01: In prod, use an env-var allowlist instead of blocking all origins.
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : [];
const corsOrigin = isProd ? (allowedOrigins.length ? allowedOrigins : false) : '*';

// SEC-10: Security headers via helmet. CSP is tailored to the app's real sources:
// same-origin scripts, inline styles (Leaflet divIcons + Tailwind), CARTO map tiles,
// the Photon geocoder, and the websocket back to our own origin.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src':  ["'self'"],
      'script-src':   ["'self'"],
      'style-src':    ["'self'", "'unsafe-inline'"],
      'img-src':      ["'self'", 'data:', 'blob:', 'https://*.basemaps.cartocdn.com'],
      'connect-src':  ["'self'", 'https://photon.komoot.io', 'ws:', 'wss:'],
      'worker-src':   ["'self'", 'blob:'],
      'object-src':   ["'none'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': isProd ? [] : null,
    },
  },
  // Allow cross-origin loading of our own static assets; we don't embed third parties.
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '64kb' }));   // SEC-11: cap request body size

const httpServer = createServer(app);
const io = new Server(httpServer, {
  // SEC-12: Apply the same origin allowlist to the websocket layer in prod, not just REST.
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
});

const socketSession    = new Map<string, string>();
const locationThrottle = new Map<string, number>();
const chatThrottle     = new Map<string, number>();
const offlineTimers    = new Map<string, ReturnType<typeof setTimeout>>();
const LOCATION_MIN_MS  = 2000;
const CHAT_MIN_MS      = 1000;
const OFFLINE_GRACE_MS = 30_000;

// H-2: Per-IP rate limiting. Separate buckets so polling one endpoint can't starve another.
type Bucket = Map<string, { count: number; resetAt: number }>;
const joinThrottle:  Bucket = new Map();   // join-session (socket)
const checkThrottle: Bucket = new Map();   // check-session (socket) — REL-03 fix: own bucket
const apiThrottle:   Bucket = new Map();   // REST /api/*
const JOIN_MAX        = 10;
const CHECK_MAX       = 30;
const API_MAX         = 60;
const JOIN_WINDOW_MS  = 60_000;

// Returns true if the request is allowed, false if the per-IP limit is exceeded.
function rateOk(bucket: Bucket, ip: string, max: number): boolean {
  const now = Date.now();
  const rl = bucket.get(ip);
  if (rl && now < rl.resetAt) {
    if (rl.count >= max) return false;
    rl.count++;
    return true;
  }
  bucket.set(ip, { count: 1, resetAt: now + JOIN_WINDOW_MS });
  return true;
}

function clientIpOf(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0]
    : Array.isArray(fwd) ? fwd[0] : undefined
  )?.trim() ?? req.socket?.remoteAddress ?? 'unknown';
}

setInterval(() => {
  const now = Date.now();
  for (const bucket of [joinThrottle, checkThrottle, apiThrottle]) {
    for (const [ip, entry] of bucket.entries()) {
      if (now >= entry.resetAt) bucket.delete(ip);
    }
  }
}, JOIN_WINDOW_MS);

// M-1: Allowlist for session ID format (alphanumeric + hyphen/underscore, 6–64 chars)
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

// H-1: Validate color is a safe 6-digit hex before broadcasting
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function safeColor(c: string): string {
  return HEX_COLOR_RE.test(c) ? c : '#888888';
}

// ── REST ──────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// SEC-13: Throttle the public session-lookup endpoint to curb enumeration/scraping.
app.use('/api', (req, res, next) => {
  if (!rateOk(apiThrottle, clientIpOf(req), API_MAX)) {
    res.status(429).json({ error: 'Too many requests' }); return;
  }
  next();
});

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

  socket.on('join-session', async ({
    sessionId, name, password, config, clientId,
  }: {
    sessionId: string;
    name: string;
    password?: string;
    config?: SessionConfig;
    clientId?: string;
  }) => {
    // M-1: Validate session ID format
    if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
      socket.emit('error', { message: 'Invalid session ID' }); return;
    }
    if (typeof name !== 'string') {
      socket.emit('error', { message: 'Invalid name' }); return;
    }

    // SEC-04: Prefer x-forwarded-for (first value) over raw TCP address to work
    // correctly behind a reverse proxy.
    const clientIp = clientIpOf({
      headers: socket.handshake.headers,
      socket: { remoteAddress: socket.handshake.address },
    });

    // H-2: Rate-limit join attempts per IP
    if (!rateOk(joinThrottle, clientIp, JOIN_MAX)) {
      socket.emit('error', { message: 'Too many join attempts, please wait', code: 'RATE_LIMITED' }); return;
    }

    // SEC-03: Validate and strip venuePoints from config before passing to getOrCreateSession.
    // Also sanitise hostToken so only a well-formed secret is ever stored/compared.
    const VENUE_ID_RE  = /^[\w-]{1,64}$/;
    const HOST_TOKEN_RE = /^[a-zA-Z0-9_-]{8,64}$/;
    let safeConfig: SessionConfig | undefined = config;
    if (config) {
      const safePoints = config.venuePoints
        ? (Array.isArray(config.venuePoints) ? config.venuePoints : [])
            .filter((p: VenuePoint) =>
              p && typeof p.id === 'string' && VENUE_ID_RE.test(p.id) &&
              Number.isFinite(p.lat) && Number.isFinite(p.lng),
            )
            .slice(0, 5)
            .map((p: VenuePoint) => ({ ...p, label: String(p.label ?? '').slice(0, 40) }))
        : config.venuePoints;
      const safeHostToken =
        typeof config.hostToken === 'string' && HOST_TOKEN_RE.test(config.hostToken)
          ? config.hostToken
          : undefined;
      safeConfig = { ...config, venuePoints: safePoints, hostToken: safeHostToken };
    }

    // COR-01: Derive isNewSession from getOrCreateSession return value to avoid race.
    const { session, created: isNewSession } = getOrCreateSession(sessionId, safeConfig);

    if (Date.now() > session.expiresAt) {
      socket.emit('error', { message: 'Session has expired', code: 'SESSION_EXPIRED' }); return;
    }

    // Host reclaim: an existing session's creator returning after a reconnect/refresh
    // presents the hostToken they were issued at creation. A match lets them skip the
    // password and re-take host (their socket.id has changed).
    const providedHostToken = safeConfig?.hostToken;
    const isReclaimingHost =
      !isNewSession && !!providedHostToken &&
      !!session.hostToken && providedHostToken === session.hostToken;

    // C-1 + password: for existing sessions, always validate password regardless of config presence.
    // PERF-01: Use async password verification to avoid blocking the event loop.
    // A verified host (isReclaimingHost) bypasses the password — they own the session.
    if (!isNewSession && session.passwordHash && !isReclaimingHost) {
      const ok = await verifyPasswordAsync(password ?? '', session.passwordHash);
      if (!ok) {
        socket.emit('error', { message: 'Incorrect password', code: 'WRONG_PASSWORD' }); return;
      }
    }

    // REL-07: De-dup reconnects. A returning user presents the same stable clientId; if a
    // participant with that clientId still occupies a (now-dead) socket, evict the old entry
    // FIRST — this frees its capacity slot, cancels its grace timer, removes its stale marker
    // for everyone, and lets us carry the old colour over to the new socket.
    const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
    const safeClientId = typeof clientId === 'string' && CLIENT_ID_RE.test(clientId) ? clientId : undefined;
    let inheritedColor: string | undefined;
    if (safeClientId) {
      const existing = findParticipantByClientId(sessionId, safeClientId);
      if (existing && existing.id !== socket.id) {
        const oldSid = existing.id;
        inheritedColor = existing.color;
        const oldTimer = offlineTimers.get(oldSid);
        if (oldTimer) { clearTimeout(oldTimer); offlineTimers.delete(oldSid); }
        socketSession.delete(oldSid);
        locationThrottle.delete(oldSid);
        chatThrottle.delete(oldSid);
        removeParticipant(sessionId, oldSid);
        io.to(sessionId).emit('participant-left', { participantId: oldSid });
      }
    }

    // M-7: Single authoritative capacity check (addParticipant also checks, but we want a typed error here)
    if (Object.keys(session.participants).length >= session.maxParticipants) {
      socket.emit('error', { message: 'Session is full', code: 'SESSION_FULL' }); return;
    }

    const participant = addParticipant(sessionId, socket.id, name, safeClientId, inheritedColor);
    if (!participant) { socket.emit('error', { message: 'Could not join session' }); return; }

    socket.join(sessionId);
    socketSession.set(socket.id, sessionId);

    // C-1: Only the creator of a NEW session can become host.
    // On reconnect/refresh, a token-verified host reclaims host on their new socket.id.
    if (safeConfig && isNewSession) setHost(sessionId, socket.id);
    else if (isReclaimingHost)     reclaimHost(sessionId, socket.id);

    const isSessionHost = isHost(sessionId, socket.id);

    // H-1: Sanitise color before sending to clients
    const sanitisedParticipants = Object.values(session.participants).map(p => ({
      ...p, color: safeColor(p.color),
    }));

    socket.emit('session-joined', {
      sessionId,
      myId:         socket.id,
      participants: sanitisedParticipants,
      expiresAt:    session.expiresAt,
      sessionName:  session.name,
      messages:     session.messages,
      isHost:       isSessionHost,
      hostId:       session.hostSocketId,
      venuePoints:  session.venuePoints,
    });

    socket.to(sessionId).emit('participant-joined', {
      participant: { ...participant, color: safeColor(participant.color) },
    });
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
    io.to(sessionId).emit('participant-moved', {
      participant: { ...participant, color: safeColor(participant.color) },
    });
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
      color:           safeColor(participant.color),
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

    const existing = offlineTimers.get(socket.id);
    if (existing) { clearTimeout(existing); offlineTimers.delete(socket.id); }

    if (immediate) {
      removeParticipant(sessionId, socket.id);
      io.to(sessionId).emit('participant-left', { participantId: socket.id });
    } else {
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

  socket.on('update-venue-points', ({ points }: { points: VenuePoint[] }) => {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;
    if (!isHost(sessionId, socket.id)) {
      socket.emit('error', { message: 'Only the host can update venue points' }); return;
    }
    if (!Array.isArray(points)) return;

    // M-2: Validate each venue point — strict format check on id to prevent prototype pollution
    const validated: VenuePoint[] = points
      .filter(p =>
        p && typeof p.id === 'string' && /^[\w-]{1,64}$/.test(p.id) &&
        typeof p.label === 'string' &&
        typeof p.lat === 'number' && typeof p.lng === 'number' &&
        p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180 &&
        isFinite(p.lat) && isFinite(p.lng),
      )
      .map(p => ({
        id:    p.id.slice(0, 64),
        label: p.label.trim().slice(0, 40) || 'Venue',
        lat:   p.lat,
        lng:   p.lng,
      }));

    const saved = updateVenuePoints(sessionId, validated);
    if (!saved) return;
    io.to(sessionId).emit('venue-points-updated', { venuePoints: saved });
  });

  // H-5: Let the client verify the session still exists after a reconnect.
  // REL-03: Apply the same per-IP rate limit as join-session.
  socket.on('check-session', ({ sessionId }: { sessionId?: string }) => {
    if (!sessionId || typeof sessionId !== 'string') {
      socket.emit('session-status', { exists: false }); return;
    }
    // REL-03: Rate-limit on its OWN bucket so reconnect polling can't exhaust the join budget.
    const ip = clientIpOf({
      headers: socket.handshake.headers,
      socket: { remoteAddress: socket.handshake.address },
    });
    if (!rateOk(checkThrottle, ip, CHECK_MAX)) {
      socket.emit('session-status', { exists: false }); return;
    }
    const session = getSession(sessionId);
    socket.emit('session-status', {
      exists: !!session && Date.now() <= session.expiresAt,
    });
  });

  socket.on('end-session', () => {
    const sessionId = socketSession.get(socket.id);
    if (!sessionId) return;
    if (!isHost(sessionId, socket.id)) {
      socket.emit('error', { message: 'Only the host can end the session' }); return;
    }

    // Get the session's participant set BEFORE ending so we can clean up offline timers.
    const endingSession = getSession(sessionId);
    const sessionParticipantIds = endingSession
      ? new Set(Object.keys(endingSession.participants))
      : new Set<string>();

    // COR-03 + REL-01: Cancel grace-period timers for sockets in this session (including
    // those already removed from socketSession due to disconnecting).
    // First: iterate socketSession to cover online sockets.
    for (const [sid, sessId] of socketSession.entries()) {
      if (sessId === sessionId) {
        const timer = offlineTimers.get(sid);
        if (timer) { clearTimeout(timer); offlineTimers.delete(sid); }
        // COR-03: Also clean up throttle maps.
        socketSession.delete(sid);
        locationThrottle.delete(sid);
        chatThrottle.delete(sid);
      }
    }
    // REL-01: Also cancel timers for offline sockets (already removed from socketSession
    // but still have pending offlineTimers).
    for (const [sid, timer] of offlineTimers.entries()) {
      if (sessionParticipantIds.has(sid)) {
        clearTimeout(timer);
        offlineTimers.delete(sid);
        locationThrottle.delete(sid);
        chatThrottle.delete(sid);
      }
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
  // SEC-02: Exclude /api/* paths from the catch-all so API 404s aren't served as index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// SEC-05: Validate PORT env var before binding.
const PORT = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
httpServer.listen(PORT, () =>
  console.log(`Converge server → http://localhost:${PORT} [${isProd ? 'production' : 'development'}]`),
);
