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
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-thin">
        {participants.map(p => (
          <Card key={p.id} participant={p} isMe={p.id === myId} isHost={p.id === hostId} me={me} />
        ))}
        {participants.length === 1 && (
          <div className="flex-shrink-0 flex items-center justify-center bg-[#1e293b]/60 border border-dashed border-slate-700 rounded-2xl px-5 py-3 min-w-[140px]">
            <p className="text-slate-500 text-xs text-center">Waiting for<br/>others to join…</p>
          </div>
        )}
      </div>
      {/* Right-fade scroll hint */}
      {participants.length > 2 && (
        <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none bg-gradient-to-l from-[#0f172a] to-transparent" />
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

  return (
    <div className={`flex-shrink-0 bg-[#1e293b] rounded-2xl px-4 py-3 min-w-[148px] border transition-opacity ${
      isOffline ? 'border-slate-700/20 opacity-60' : 'border-slate-700/40'
    }`}>
      {/* Name row */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-shrink-0">
          <span
            className="block w-3 h-3 rounded-full ring-2 ring-white/20"
            style={{ background: p.color }}
          />
          {/* Online/offline pulse */}
          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1e293b] ${
            isOffline ? 'bg-slate-600' : 'bg-emerald-400'
          }`} />
        </div>
        <span className="text-white text-sm font-semibold truncate max-w-[80px]">{p.name}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isHost
            ? <span className="text-[10px] text-amber-400 bg-amber-500/10 rounded-full px-1.5 py-0.5">host</span>
            : <span className="text-[10px] text-slate-400 bg-slate-700/60 rounded-full px-1.5 py-0.5">guest</span>
          }
          {isMe && (
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded-full px-1.5 py-0.5">you</span>
          )}
        </div>
      </div>

      {/* Status */}
      {isOffline ? (
        <p className="text-xs text-slate-600 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-600" />
          Offline
        </p>
      ) : hasLocation ? (
        <div className="space-y-0.5">
          {isMe ? (
            <p className="text-xs text-emerald-400 font-medium">📍 Sharing</p>
          ) : dist !== null ? (
            <>
              <p className="text-xs text-slate-300 font-medium">{formatDistance(dist)}</p>
              {/* L-3: use the participant's live speed (m/s → km/h) when moving, else walking pace. */}
              <p className="text-xs text-emerald-400 font-semibold">
                {formatETA(dist, p.speed && p.speed > 0 ? p.speed * 3.6 : undefined)}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Calculating…</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Locating…
        </p>
      )}
    </div>
  );
}
