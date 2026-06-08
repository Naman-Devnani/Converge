import { useMemo } from 'react';
import type { Participant } from '../types';
import { haversineKm, formatDistance, formatETA } from '../utils/geo';

interface Props {
  participants: Participant[];
  myId: string;
  hostId: string;
}

export default function ParticipantList({ participants, myId, hostId }: Props) {
  const me = participants.find(p => p.id === myId);
  return (
    <div className="flex gap-3 overflow-x-auto px-3 sm:px-container-margin py-md no-scrollbar">
      {participants.map(p => (
        <Card key={p.id} participant={p} isMe={p.id === myId} isHost={p.id === hostId} me={me} />
      ))}
      {participants.length === 1 && (
        <div className="flex-none w-44 flex items-center justify-center bg-surface-container/60 border border-dashed border-white/10 rounded-3xl px-4 py-3">
          <p className="text-on-surface-variant text-label-md text-center">Waiting for others to join…</p>
        </div>
      )}
    </div>
  );
}

function Card({ participant: p, isMe, isHost, me }: { participant: Participant; isMe: boolean; isHost: boolean; me?: Participant }) {
  const dist = useMemo(() => {
    // L-9: strict null checks — `!p.lat` would wrongly drop lat/lng === 0 (equator / prime meridian).
    if (isMe || me?.lat == null || me?.lng == null || p.lat == null || p.lng == null) return null;
    return haversineKm(me.lat, me.lng, p.lat, p.lng);
  }, [p.lat, p.lng, me?.lat, me?.lng, isMe]);

  const hasLocation = p.lat !== null;
  const isOffline = !isMe && p.online === false;
  const arrived = dist !== null && dist < 0.03;

  return (
    <div className={`flex-none w-[14rem] sm:w-64 bg-surface-container/90 backdrop-blur-xl border rounded-3xl p-3.5 flex gap-3 shadow-2xl transition-transform duration-300 sm:hover:scale-[1.02] ${arrived ? 'border-secondary/30' : 'border-white/10'} ${isOffline ? 'opacity-60' : ''}`}>
      {/* Avatar */}
      <div className="relative flex-none">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-on-secondary text-lg sm:text-xl font-extrabold" style={{ background: p.color }}>
          {p.name.charAt(0).toUpperCase()}
        </div>
        <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-surface-container ${isOffline ? 'bg-outline' : 'bg-secondary status-pulse'}`} />
      </div>

      {/* Info */}
      <div className="flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-xs">
          <h3 className="text-headline-md text-on-surface truncate">{isMe ? `${p.name} (You)` : p.name}</h3>
          {isHost
            ? <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded uppercase tracking-wider flex-shrink-0">Host</span>
            : <span className="px-1.5 py-0.5 bg-white/5 text-on-surface-variant text-[10px] font-bold rounded uppercase tracking-wider flex-shrink-0">Guest</span>}
        </div>

        {isOffline ? (
          <p className="text-label-md text-on-surface-variant">Offline</p>
        ) : isMe ? (
          <p className="text-label-md text-secondary font-bold">📍 Sharing</p>
        ) : !hasLocation ? (
          <p className="text-label-md text-on-surface-variant">Locating…</p>
        ) : arrived ? (
          <p className="text-label-md text-secondary font-bold">Arrived!</p>
        ) : dist !== null ? (
          <p className="text-label-md text-on-surface-variant">
            {formatDistance(dist).replace(' away', '')} · {formatETA(dist, p.speed && p.speed > 0 ? p.speed * 3.6 : undefined)}
          </p>
        ) : (
          <p className="text-label-md text-on-surface-variant">Calculating…</p>
        )}
      </div>
    </div>
  );
}
