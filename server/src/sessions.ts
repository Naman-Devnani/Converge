import type { Session, Participant } from './types';

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

const SESSION_TTL = 2 * 60 * 60 * 1000;   // 2 hours
const EMPTY_TTL  = 10 * 60 * 1000;        // 10 min after last person leaves

const sessions = new Map<string, Session>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    const hardExpired  = now > session.expiresAt;
    const emptyExpired = session.emptyAt !== null && now > session.emptyAt + EMPTY_TTL;
    if (hardExpired || emptyExpired) sessions.delete(id);
  }
}, 60_000);

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getOrCreateSession(id: string): Session {
  if (sessions.has(id)) return sessions.get(id)!;
  const session: Session = {
    id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL,
    participants: {},
    emptyAt: null,
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

  const participant: Participant = {
    id: socketId,
    name: name.slice(0, 32) || 'Anonymous',
    lat: null, lng: null, accuracy: null,
    heading: null, speed: null, lastUpdate: null,
    color: nextColor(session),
    joinedAt: Date.now(),
  };

  session.participants[socketId] = participant;
  session.emptyAt = null;
  return participant;
}

export function updateLocation(
  sessionId: string,
  socketId: string,
  lat: number, lng: number,
  accuracy: number | null,
  heading: number | null,
  speed: number | null,
): Participant | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const p = session.participants[socketId];
  if (!p) return null;

  p.lat = lat; p.lng = lng;
  p.accuracy = accuracy; p.heading = heading; p.speed = speed;
  p.lastUpdate = Date.now();
  return p;
}

export function removeParticipant(sessionId: string, socketId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  delete session.participants[socketId];
  if (Object.keys(session.participants).length === 0) {
    session.emptyAt = Date.now();
  }
}
