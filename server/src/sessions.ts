import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import type { Session, Participant, ChatMessage, VenuePoint } from './types';

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

const HOUR_MS     = 60 * 60 * 1000;
const DEFAULT_TTL = 2 * HOUR_MS;
const EMPTY_TTL   = 10 * 60 * 1000;
const MAX_MESSAGES = 100;

// C-2: scrypt params — N=16384 gives ~30 ms per hash (acceptable for low-concurrency join flow)
const SCRYPT_N      = 16384;
const SCRYPT_R      = 8;
const SCRYPT_P      = 1;
const SCRYPT_KEYLEN = 32;

const sessions = new Map<string, Session>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    const hardExpired  = now > session.expiresAt;
    const emptyExpired = session.emptyAt !== null && now > session.emptyAt + EMPTY_TTL;
    if (hardExpired || emptyExpired) sessions.delete(id);
  }
}, 60_000);

// C-2: Hash password with per-session random salt using scrypt.
// Returns "salt:hash" so both are stored together in passwordHash.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `${salt}:${hash.toString('hex')}`;
}

// C-2: Constant-time verification — splits stored "salt:hash", re-derives and compares.
export function verifyPassword(password: string, stored: string): boolean {
  const colonIdx = stored.indexOf(':');
  if (colonIdx === -1) return false;
  const salt      = stored.slice(0, colonIdx);
  const storedHex = stored.slice(colonIdx + 1);
  try {
    const derived  = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    const storedBuf = Buffer.from(storedHex, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export interface SessionConfig {
  name?: string;
  password?: string;
  expiryHours?: number;
  maxParticipants?: number;
  venuePoints?: VenuePoint[];
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function sessionExists(id: string): boolean {
  return sessions.has(id);
}

export function getOrCreateSession(id: string, config?: SessionConfig): Session {
  if (sessions.has(id)) return sessions.get(id)!;
  const ttl = config?.expiryHours
    ? Math.min(Math.max(config.expiryHours, 1), 24) * HOUR_MS
    : DEFAULT_TTL;
  const session: Session = {
    id,
    name: (config?.name ?? '').slice(0, 60),
    hostSocketId: '',
    createdAt: Date.now(),
    expiresAt: Date.now() + ttl,
    participants: {},
    emptyAt: null,
    passwordHash: config?.password ? hashPassword(config.password) : null,
    maxParticipants: Math.min(Math.max(config?.maxParticipants ?? 20, 2), 50),
    messages: [],
    venuePoints: (config?.venuePoints ?? []).slice(0, 5),
  };
  sessions.set(id, session);
  return session;
}

function nextColor(session: Session): string {
  const used = new Set(Object.values(session.participants).map(p => p.color));
  return COLORS.find(c => !used.has(c)) ?? COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function addParticipant(sessionId: string, socketId: string, name: string): Participant | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Object.keys(session.participants).length >= session.maxParticipants) return null;

  const participant: Participant = {
    id: socketId,
    name: name.slice(0, 32) || 'Anonymous',
    lat: null, lng: null, accuracy: null,
    heading: null, speed: null, lastUpdate: null,
    color: nextColor(session),
    joinedAt: Date.now(),
    online: true,
    lastSeen: Date.now(),
  };
  session.participants[socketId] = participant;
  session.emptyAt = null;
  return participant;
}

export function updateLocation(
  sessionId: string, socketId: string,
  lat: number, lng: number,
  accuracy: number | null, heading: number | null, speed: number | null,
): Participant | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const p = session.participants[socketId];
  if (!p) return null;
  p.lat = lat; p.lng = lng;
  p.accuracy = accuracy; p.heading = heading; p.speed = speed;
  p.lastUpdate = Date.now();
  p.lastSeen = Date.now();
  return p;
}

export function setHost(sessionId: string, socketId: string): void {
  const session = sessions.get(sessionId);
  if (session && !session.hostSocketId) session.hostSocketId = socketId;
}

export function isHost(sessionId: string, socketId: string): boolean {
  return sessions.get(sessionId)?.hostSocketId === socketId;
}

export function endSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function removeParticipant(sessionId: string, socketId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  delete session.participants[socketId];
  if (Object.keys(session.participants).length === 0) session.emptyAt = Date.now();
}

export function setParticipantOnline(sessionId: string, socketId: string, online: boolean): Participant | null {
  const session = sessions.get(sessionId);
  if (!session?.participants[socketId]) return null;
  session.participants[socketId].online   = online;
  session.participants[socketId].lastSeen = Date.now();
  return session.participants[socketId];
}

export function validatePassword(sessionId: string, password: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (!session.passwordHash) return true;
  return verifyPassword(password, session.passwordHash);
}

export function addMessage(
  sessionId: string,
  msg: Omit<ChatMessage, 'id' | 'timestamp'>,
): ChatMessage | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const message: ChatMessage = { ...msg, id: randomUUID(), timestamp: Date.now() };
  session.messages.push(message);
  if (session.messages.length > MAX_MESSAGES) session.messages.shift();
  return message;
}

export function updateVenuePoints(sessionId: string, points: VenuePoint[]): VenuePoint[] | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.venuePoints = points.slice(0, 5);
  return session.venuePoints;
}
