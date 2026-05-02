import { useMemo } from 'react';
import type { Participant } from '../types';
import { haversineKm, formatDistance, formatETA } from '../utils/geo';

interface Props {
  participants: Participant[];
  myId: string;
}

export default function ParticipantList({ participants, myId }: Props) {
  const me = participants.find(p => p.id === myId);

  return (
    <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-thin">
      {participants.map(p => (
        <Card key={p.id} participant={p} isMe={p.id === myId} me={me} />
      ))}
      {participants.length === 1 && (
        <div className="flex-shrink-0 flex items-center justify-center bg-[#1e293b]/60 border border-dashed border-slate-700 rounded-2xl px-5 py-3 min-w-[140px]">
          <p className="text-slate-500 text-xs text-center">Waiting for<br/>others to join…</p>
        </div>
      )}
    </div>
  );
}

function Card({ participant: p, isMe, me }: { participant: Participant; isMe: boolean; me?: Participant }) {
  const dist = useMemo(() => {
    if (isMe || !me?.lat || !p.lat) return null;
    return haversineKm(me.lat, me.lng!, p.lat, p.lng!);
  }, [p.lat, p.lng, me?.lat, me?.lng, isMe]);

  const hasLocation = p.lat !== null;

  return (
    <div className="flex-shrink-0 bg-[#1e293b] rounded-2xl px-4 py-3 min-w-[148px] border border-slate-700/40">
      {/* Name row */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white/20"
          style={{ background: p.color }}
        />
        <span className="text-white text-sm font-semibold truncate max-w-[96px]">{p.name}</span>
        {isMe && (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded-full px-1.5 py-0.5 flex-shrink-0">you</span>
        )}
      </div>

      {/* Status */}
      {hasLocation ? (
        <div className="space-y-0.5">
          {isMe ? (
            <p className="text-xs text-emerald-400 font-medium">📍 Sharing</p>
          ) : dist !== null ? (
            <>
              <p className="text-xs text-slate-300 font-medium">{formatDistance(dist)}</p>
              <p className="text-xs text-emerald-400 font-semibold">{formatETA(dist)}</p>
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
