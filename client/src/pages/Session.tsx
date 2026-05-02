import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { socket } from '../socket';
import type { Participant, SessionState, ChatMessage } from '../types';
import { haversineKm, toApproximate } from '../utils/geo';
import { addToHistory } from '../utils/history';
import MeetMap from '../components/MeetMap';
import ConsentModal from '../components/ConsentModal';
import ParticipantList from '../components/ParticipantList';
import ShareModal from '../components/ShareModal';
import PasswordModal from '../components/PasswordModal';
import ChatPanel from '../components/ChatPanel';

const ARRIVED_THRESHOLD_KM = 0.08;

interface HostState {
  isHost?: boolean;
  sessionName?: string;
  password?: string;
  expiryHours?: number;
  maxParticipants?: number;
}

export default function Session() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hostState = useLocation().state as HostState | null;

  const [session,            setSession]           = useState<SessionState | null>(null);
  const [showConsent,        setShowConsent]        = useState(false);
  const [showShare,          setShowShare]          = useState(false);
  const [showChat,           setShowChat]           = useState(false);
  const [showPasswordModal,  setShowPasswordModal]  = useState(false);
  const [passwordError,      setPasswordError]      = useState<string | null>(null);
  const [pendingPassword,    setPendingPassword]    = useState('');
  const [geoError,           setGeoError]           = useState<string | null>(null);
  const [isNewSession,       setIsNewSession]       = useState(false);
  const [arrivals,           setArrivals]           = useState<string[]>([]);
  const [chatMessages,       setChatMessages]       = useState<ChatMessage[]>([]);
  const [unreadCount,        setUnreadCount]        = useState(0);
  const [isConnected,        setIsConnected]        = useState(socket.connected);
  const [expiresAt,          setExpiresAt]          = useState<number | null>(null);
  const [sessionName,        setSessionName]        = useState('');
  const [timeLeft,           setTimeLeft]           = useState('');

  const watchIdRef   = useRef<number | null>(null);
  const approxRef    = useRef(false);
  const notifiedRef  = useRef<Set<string>>(new Set());
  const showChatRef  = useRef(false);

  useEffect(() => { showChatRef.current = showChat; }, [showChat]);

  // Validate session ID
  useEffect(() => {
    if (!sessionId || sessionId.length < 6) navigate('/');
  }, [sessionId, navigate]);

  // Check session existence + password requirement
  useEffect(() => {
    if (!sessionId) return;

    if (hostState?.isHost) {
      setIsNewSession(true);
      setShowConsent(true);
      return;
    }

    fetch(`/api/sessions/${sessionId}`)
      .then(r => {
        if (r.status === 404) {
          setIsNewSession(true);
          setShowConsent(true);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        if (data.hasPassword) {
          setShowPasswordModal(true);
        } else {
          setShowConsent(true);
        }
      })
      .catch(() => {
        setIsNewSession(true);
        setShowConsent(true);
      });
  }, [sessionId, hostState?.isHost]);

  // Expiry countdown
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = expiresAt - Date.now();
      if (left <= 0) { setTimeLeft('Expired'); return; }
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  // Socket event listeners
  useEffect(() => {
    if (!sessionId) return;

    socket.on('connect',    () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('session-joined', (data: {
      sessionId: string;
      myId: string;
      participants: Participant[];
      expiresAt: number;
      sessionName: string;
      messages: ChatMessage[];
    }) => {
      const map: Record<string, Participant> = {};
      data.participants.forEach(p => { map[p.id] = p; });
      setSession({
        sessionId: data.sessionId,
        myId: data.myId,
        participants: map,
        expiresAt: data.expiresAt,
        sessionName: data.sessionName,
      });
      setExpiresAt(data.expiresAt);
      setSessionName(data.sessionName);
      setChatMessages(data.messages || []);
      addToHistory(data.sessionId, data.sessionName);
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

    socket.on('participant-status', ({ participantId, online }: { participantId: string; online: boolean }) => {
      setSession(prev => {
        if (!prev?.participants[participantId]) return prev;
        return {
          ...prev,
          participants: {
            ...prev.participants,
            [participantId]: { ...prev.participants[participantId], online, lastSeen: Date.now() },
          },
        };
      });
    });

    socket.on('chat-message', ({ message }: { message: ChatMessage }) => {
      setChatMessages(prev => [...prev, message]);
      if (!showChatRef.current) setUnreadCount(c => c + 1);
    });

    socket.on('error', ({ message }: { message: string }) => {
      if (message === 'Incorrect password') {
        setPasswordError('Wrong password. Try again.');
        setShowConsent(false);
        setShowPasswordModal(true);
      } else {
        console.error('Socket:', message);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('session-joined');
      socket.off('participant-joined');
      socket.off('participant-moved');
      socket.off('participant-left');
      socket.off('participant-status');
      socket.off('chat-message');
      socket.off('error');
      if (socket.connected) {
        socket.emit('leave-session');
        socket.disconnect();
      }
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [sessionId]);

  // "Arrived" detection + haptic
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
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
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
        if (approxRef.current) {
          const a = toApproximate(lat, lng);
          lat = a.lat;
          lng = a.lng;
        }
        socket.emit('location-update', {
          lat,
          lng,
          accuracy: approxRef.current ? 500 : pos.coords.accuracy,
          heading:  pos.coords.heading,
          speed:    pos.coords.speed,
        });
        setGeoError(null);
      },
      err => {
        if (err.code === err.PERMISSION_DENIED)
          setGeoError("Location permission denied. Others can't see you on the map.");
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 },
    );
    watchIdRef.current = id;
  }, []);

  const handlePasswordSubmit = useCallback((pwd: string) => {
    setPendingPassword(pwd);
    setPasswordError(null);
    setShowPasswordModal(false);
    setShowConsent(true);
  }, []);

  const handleConsent = useCallback((name: string, approxMode: boolean) => {
    approxRef.current = approxMode;
    setShowConsent(false);

    const doJoin = () => {
      if (hostState?.isHost) {
        socket.emit('join-session', {
          sessionId,
          name,
          config: {
            sessionName: hostState.sessionName || '',
            password:    hostState.password    || '',
            expiryHours: hostState.expiryHours ?? 2,
            maxParticipants: hostState.maxParticipants ?? 20,
          },
        });
      } else {
        socket.emit('join-session', {
          sessionId,
          name,
          password: pendingPassword || undefined,
        });
      }
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.connect();
      socket.once('connect', doJoin);
    }
    startLocationWatch();
  }, [sessionId, startLocationWatch, pendingPassword, hostState]);

  const sessionUrl  = `${window.location.origin}/session/${sessionId}`;
  const participants = session ? Object.values(session.participants) : [];
  const expiringSoon = expiresAt ? expiresAt - Date.now() < 600_000 : false;

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#0f172a]"
      style={{
        paddingTop:    'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
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
          {/* Session name + expiry */}
          {session && (sessionName || timeLeft) && (
            <div className="flex flex-col items-end">
              {sessionName && (
                <span className="text-white text-xs font-semibold truncate max-w-[110px] leading-tight">{sessionName}</span>
              )}
              {timeLeft && (
                <span className={`text-[10px] font-mono leading-tight ${expiringSoon ? 'text-amber-400' : 'text-slate-500'}`}>
                  ⏱ {timeLeft}
                </span>
              )}
            </div>
          )}

          {/* Participant count + connection indicator */}
          {session && (
            <div className="flex items-center gap-1.5 bg-[#1e293b] rounded-full px-3 py-1">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400 animate-pulse'}`} />
              <span className="text-white text-xs font-semibold">{participants.length}</span>
            </div>
          )}

          {/* Chat button */}
          {session && (
            <button
              onClick={() => { setShowChat(true); setUnreadCount(0); }}
              className="relative w-9 h-9 flex items-center justify-center bg-[#1e293b] hover:bg-[#334155] text-white rounded-xl transition-colors"
              aria-label="Open chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Invite */}
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

      {/* ── Disconnected banner ── */}
      {session && !isConnected && (
        <div className="flex-shrink-0 bg-red-500/90 text-white text-xs font-medium text-center py-2 px-4 flex items-center justify-center gap-2 z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          Reconnecting… your location isn't updating.
        </div>
      )}

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

        {/* Geo error toast */}
        {geoError && (
          <div className="absolute bottom-4 left-4 right-4 bg-amber-500/90 backdrop-blur-sm text-white text-sm rounded-xl px-4 py-3 shadow-lg z-20">
            ⚠️ {geoError}
          </div>
        )}

        {/* Arrived toasts */}
        {arrivals.length > 0 && (
          <div className="absolute top-4 left-4 right-4 flex flex-col gap-2 z-20 pointer-events-none">
            {arrivals.map((name, i) => (
              <div key={i} className="slide-up bg-emerald-500 text-white text-sm font-semibold rounded-2xl px-4 py-3 shadow-lg flex items-center gap-2">
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
      {showPasswordModal && (
        <PasswordModal
          sessionName={sessionName}
          error={passwordError}
          onSubmit={handlePasswordSubmit}
        />
      )}
      {showConsent && (
        <ConsentModal isNewSession={isNewSession} onConsent={handleConsent} />
      )}
      {showShare && session && (
        <ShareModal
          sessionUrl={sessionUrl}
          password={hostState?.password}
          onClose={() => setShowShare(false)}
        />
      )}
      {showChat && session && (
        <ChatPanel
          messages={chatMessages}
          myId={session.myId}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
