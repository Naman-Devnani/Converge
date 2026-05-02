import { createHash, randomUUID } from 'crypto';
import type { Session, Participant, ChatMessage, VenuePoint } from './types';

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

const DEFAULT_TTL = 2 * 60 * 60 * 1000;
const EMPTY_TTL   = 10 * 60 * 1000;
const MAX_MESSAGES = 100;

const sessions = new Map<string, Session>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    const hardExpired  = now > session.expiresAt;
    const emptyExpired = session.emptyAt !== null && now > session.emptyAt + EMPTY_TTL;
    if (hardExpired || emptyExpired) sessions.delete(id);
  }
}, 60_000);

export function hashPassword(password: string): string {
  return createHash('sha256').update(`meetsync:${password}`).digest('hex');
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

export function getOrCreateSession(id: string, config?: SessionConfig): Session {
  if (sessions.has(id)) return sessions.get(id)!;
  const ttl = Math.min(Math.max(config?.expiryHours ?? 2, 1), 24) * 60 * 60 * 1000;
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
  return session.passwordHash === hashPassword(password);
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
