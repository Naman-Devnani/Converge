import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import type { Participant, SessionState } from '../types';
import { haversineKm, toApproximate } from '../utils/geo';
import MeetMap from '../components/MeetMap';
import ConsentModal from '../components/ConsentModal';
import ParticipantList from '../components/ParticipantList';
import ShareModal from '../components/ShareModal';

const ARRIVED_THRESHOLD_KM = 0.08; // 80 m

export default function Session() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession]           = useState<SessionState | null>(null);
  const [showConsent, setShowConsent]   = useState(true);
  const [showShare, setShowShare]       = useState(false);
  const [geoError, setGeoError]         = useState<string | null>(null);
  const [isNewSession, setIsNewSession] = useState(false);
  const [arrivals, setArrivals]         = useState<string[]>([]);

  const watchIdRef    = useRef<number | null>(null);
  const approxModeRef = useRef(false);
  const notifiedRef   = useRef<Set<string>>(new Set());

  // Validate session ID
  useEffect(() => {
    if (!sessionId || sessionId.length < 6) navigate('/');
  }, [sessionId, navigate]);

  // Check if this is a brand-new session
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}`)
      .then(r => setIsNewSession(r.status === 404))
      .catch(() => setIsNewSession(true));
  }, [sessionId]);

  // Socket event listeners
  useEffect(() => {
    if (!sessionId) return;

    socket.on('session-joined', (data: { sessionId: string; myId: string; participants: Participant[] }) => {
      const map: Record<string, Participant> = {};
      data.participants.forEach(p => { map[p.id] = p; });
      setSession({ sessionId: data.sessionId, myId: data.myId, participants: map });
    });

    socket.on('participant-joined', ({ participant }: { participant: Participant }) => {
      setSession(prev => prev
        ? { ...prev, participants: { ...prev.participants, [participant.id]: participant } }
        : prev);
    });

    socket.on('participant-moved', ({ participant }: { participant: Participant }) => {
      setSession(prev => prev
        ? { ...prev, participants: { ...prev.participants, [participant.id]: participant } }
        : prev);
    });

    socket.on('participant-left', ({ participantId }: { participantId: string }) => {
      setSession(prev => {
        if (!prev) return prev;
        const participants = { ...prev.participants };
        delete participants[participantId];
        return { ...prev, participants };
      });
      notifiedRef.current.delete(participantId);
    });

    socket.on('error', ({ message }: { message: string }) => console.error('Socket:', message));

    return () => {
      socket.off('session-joined');
      socket.off('participant-joined');
      socket.off('participant-moved');
      socket.off('participant-left');
      socket.off('error');
      if (socket.connected) {
        socket.emit('leave-session');
        socket.disconnect();
      }
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [sessionId]);

  // "Arrived" detection — fires when any other participant comes within 80 m of me
  useEffect(() => {
    if (!session) return;
    const me = session.participants[session.myId];
    if (!me?.lat) return;

    for (const p of Object.values(session.participants)) {
      if (p.id === session.myId || !p.lat) continue;
      const dist = haversineKm(me.lat, me.lng!, p.lat, p.lng!);

      if (dist < ARRIVED_THRESHOLD_KM && !notifiedRef.current.has(p.id)) {
        notifiedRef.current.add(p.id);
        const name = p.name;
        setArrivals(prev => [...prev, name]);
        setTimeout(() => {
          setArrivals(prev => prev.filter(n => n !== name));
          notifiedRef.current.delete(p.id);
        }, 5000);
      }
    }
  }, [session]);

  const startLocationWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      pos => {
        let lat = pos.coords.latitude;
        let lng = pos.coords.longitude;

        if (approxModeRef.current) {
          const approx = toApproximate(lat, lng);
          lat = approx.lat;
          lng = approx.lng;
        }

        socket.emit('location-update', {
          lat,
          lng,
          accuracy: approxModeRef.current ? 500 : pos.coords.accuracy,
          heading:  pos.coords.heading,
          speed:    pos.coords.speed,
        });
        setGeoError(null);
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError("Location permission denied. Others can't see you on the map.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 },
    );
    watchIdRef.current = id;
  }, []);

  const handleConsent = useCallback((name: string, approxMode: boolean) => {
    approxModeRef.current = approxMode;
    setShowConsent(false);
    socket.connect();
    socket.once('connect', () => {
      socket.emit('join-session', { sessionId, name });
    });
    startLocationWatch();
  }, [sessionId, startLocationWatch]);

  const sessionUrl = `${window.location.origin}/session/${sessionId}`;
  const participants = session ? Object.values(session.participants) : [];

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0f172a]">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#0f172a]/90 backdrop-blur-md z-10 flex-shrink-0 border-b border-slate-800/60">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            <circle cx="12" cy="9" r="2.5"/>
          </svg>
          <span className="font-bold text-white text-sm">MeetSync</span>
        </button>

        <div className="flex items-center gap-2">
          {session && (
            <div className="flex items-center gap-1.5 bg-[#1e293b] rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white text-xs font-semibold">{participants.length}</span>
            </div>
          )}
          {session && (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Invite
            </button>
          )}
        </div>
      </header>

      {/* ── Map ── */}
      <div className="flex-1 relative min-h-0">
        {session ? (
          <MeetMap participants={participants} myId={session.myId} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1e293b]">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Connecting…</p>
            </div>
          </div>
        )}

        {/* Zoom controls */}
        {session && (
          <div className="absolute right-4 top-4 flex flex-col gap-1 z-10">
            <ZoomBtn delta={1} />
            <ZoomBtn delta={-1} />
          </div>
        )}

        {/* Geo error toast */}
        {geoError && (
          <div className="absolute bottom-4 left-4 right-4 bg-amber-500/90 backdrop-blur-sm text-white text-sm rounded-xl px-4 py-3 shadow-lg z-20">
            ⚠️ {geoError}
          </div>
        )}

        {/* "Arrived!" toasts */}
        {arrivals.length > 0 && (
          <div className="absolute top-4 left-4 right-16 flex flex-col gap-2 z-20 pointer-events-none">
            {arrivals.map((name, i) => (
              <div
                key={i}
                className="slide-up bg-emerald-500 text-white text-sm font-semibold rounded-2xl px-4 py-3 shadow-lg flex items-center gap-2"
              >
                <span className="text-lg">🎉</span>
                <span>{name} has arrived!</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Participant list ── */}
      {session && (
        <div className="flex-shrink-0 bg-[#0f172a]/95 backdrop-blur-sm border-t border-slate-800/60">
          <ParticipantList participants={participants} myId={session.myId} />
        </div>
      )}

      {/* ── Modals ── */}
      {showConsent && (
        <ConsentModal isNewSession={isNewSession} onConsent={handleConsent} />
      )}
      {showShare && session && (
        <ShareModal sessionUrl={sessionUrl} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

function ZoomBtn({ delta }: { delta: number }) {
  return (
    <button
      onClick={() => {
        const map = (document.querySelector('.leaflet-container') as any)?._leaflet_map;
        map?.setZoom(map.getZoom() + delta);
      }}
      className="w-9 h-9 bg-[#1e293b]/90 backdrop-blur-sm text-white rounded-xl shadow-lg flex items-center justify-center text-lg font-bold hover:bg-[#334155] transition-colors"
    >
      {delta > 0 ? '+' : '−'}
    </button>
  );
}
