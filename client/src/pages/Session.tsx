import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { socket } from '../socket';
import type { Participant, SessionState, ChatMessage, VenuePoint } from '../types';
import { haversineKm, makeApproximator } from '../utils/geo';
import { addToHistory } from '../utils/history';
import { useFocusTrap } from '../utils/useFocusTrap';
import ConsentModal from '../components/ConsentModal';
import ParticipantList from '../components/ParticipantList';
import ShareModal from '../components/ShareModal';
import PasswordModal from '../components/PasswordModal';
import ChatPanel from '../components/ChatPanel';

// Lazy-loaded: both pull in Leaflet, kept out of the route's entry chunk.
const MeetMap     = lazy(() => import('../components/MeetMap'));
const VenuePicker = lazy(() => import('../components/VenuePicker'));

const ARRIVED_THRESHOLD_KM = 0.08;

interface HostState {
  isHost?: boolean;
  hostToken?: string;
  sessionName?: string;
  password?: string;
  expiryHours?: number;
  maxParticipants?: number;
  venuePoints?: VenuePoint[];
}

const HOST_TOKEN_KEY = (id: string) => `converge_host_${id}`;

// SEC-07: Full regex check for session ID format (module scope — stable identity).
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

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
  // L-2: store {id, msg} so duplicate messages get unique React keys.
  const [arrivals,           setArrivals]           = useState<{ id: string; msg: string }[]>([]);
  const [reconnectFailed,    setReconnectFailed]    = useState(false); // M-10
  const [chatMessages,       setChatMessages]       = useState<ChatMessage[]>([]);
  const [unreadCount,        setUnreadCount]        = useState(0);
  const [isConnected,        setIsConnected]        = useState(socket.connected);
  // QUAL-04: Derive expiresAt and sessionName from session state instead of duplicating.
  const [timeLeft,           setTimeLeft]           = useState('');
  const [fetchError,         setFetchError]         = useState<string | null>(null); // SEC-06
  const [joinError,          setJoinError]          = useState<string | null>(null); // surface non-password join errors
  const [amHost,             setAmHost]             = useState(false);
  const [confirmEnd,         setConfirmEnd]         = useState(false);
  const [sessionEnded,       setSessionEnded]       = useState(false);
  const [sessionExpired,     setSessionExpired]     = useState(false);
  const [showVenueEditor,    setShowVenueEditor]    = useState(false);
  const [draftVenuePoints,   setDraftVenuePoints]   = useState<VenuePoint[]>([]);

  const watchIdRef         = useRef<number | null>(null);
  const approxRef          = useRef(false);
  // M-6: stable per-session approximator function (null = exact mode)
  const approxFnRef        = useRef<((lat: number, lng: number) => { lat: number; lng: number }) | null>(null);
  const notifiedRef        = useRef<Set<string>>(new Set());
  const showChatRef        = useRef(false);
  const sessionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // H-5: store join params so we can re-emit join-session on socket reconnect
  const joinParamsRef      = useRef<Parameters<typeof socket.emit>[1] | null>(null);
  const hasJoinedRef       = useRef(false);
  // M-5: guard against double-disconnect in cleanup vs Leave button
  const disconnectedRef    = useRef(false);
  // COR-06: Capture hostState in a ref so handleConsent doesn't recreate on every render.
  const hostStateRef       = useRef(hostState);
  useEffect(() => { hostStateRef.current = hostState; }, [hostState]);

  // Returning host after a full page refresh: location.state is gone, but the host
  // token was persisted to localStorage so we can still reclaim host. Read once.
  const storedHostToken = useMemo(
    () => (sessionId ? localStorage.getItem(HOST_TOKEN_KEY(sessionId)) : null),
    [sessionId],
  );
  const hostToken = hostState?.hostToken ?? storedHostToken ?? undefined;
  const hostTokenRef = useRef(hostToken);
  useEffect(() => { hostTokenRef.current = hostToken; }, [hostToken]);

  // Stable per-session client identity (sessionStorage → survives reload/reconnect in this
  // tab, fresh in a new tab) so the server can re-attach a reconnect to our existing slot
  // instead of spawning a duplicate participant.
  const clientIdRef = useRef<string>('');
  if (!clientIdRef.current && sessionId) {
    const key = `converge_cid_${sessionId}`;
    let cid = sessionStorage.getItem(key);
    if (!cid) { cid = crypto.randomUUID(); try { sessionStorage.setItem(key, cid); } catch { /* ignore */ } }
    clientIdRef.current = cid;
  }

  // QUAL-04: Derive expiresAt and sessionName from session to avoid duplicate state.
  const expiresAt   = session?.expiresAt  ?? null;
  const sessionName = session?.sessionName ?? '';

  useEffect(() => { showChatRef.current = showChat; }, [showChat]);

  // Focus trap for the inline venue-editor dialog (host only).
  const venueEditorRef = useFocusTrap<HTMLDivElement>(showVenueEditor, () => setShowVenueEditor(false));

  // Host's share password survives a refresh: read from the persisted host config so the
  // host can still copy/re-share it after reloading (location.state is gone by then).
  const sharePassword = hostState?.password ?? (() => {
    if (!sessionId) return undefined;
    try { return JSON.parse(sessionStorage.getItem(`converge_hostcfg_${sessionId}`) || 'null')?.password || undefined; }
    catch { return undefined; }
  })();

  // SEC-07: Full regex check for session ID format.
  useEffect(() => {
    if (!sessionId || !SESSION_ID_RE.test(sessionId)) navigate('/');
  }, [sessionId, navigate]);

  // Check session existence + password requirement
  useEffect(() => {
    if (!sessionId) return;

    if (hostState?.isHost) {
      setIsNewSession(true);
      setShowConsent(true);
      return;
    }

    // Returning host (refresh): we hold the host token, so skip the password prompt
    // and join straight away — the server validates the token and re-grants host.
    if (storedHostToken) {
      setShowConsent(true);
      return;
    }

    // REL-05: Add AbortController with 8-second timeout to prevent hanging fetches.
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(`/api/sessions/${sessionId}`, { signal: ctrl.signal })
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
      // SEC-06: On network error, show error state rather than silently opening consent.
      .catch(() => {
        setFetchError('Could not reach server — try refreshing.');
      })
      .finally(() => clearTimeout(timer));
  }, [sessionId, hostState?.isHost, storedHostToken]);

  // Expiry countdown
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = expiresAt - Date.now();
      if (left <= 0) {
        setTimeLeft('Expired');
        setSessionExpired(true);
        if (sessionId) { try { localStorage.removeItem(HOST_TOKEN_KEY(sessionId)); } catch { /* ignore */ } }
        return;
      }
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, sessionId]);

  // Socket event listeners
  useEffect(() => {
    if (!sessionId) return;

    // H-3: capture named handler references so socket.off removes exactly
    // these listeners and not every listener on the same event.

    const onConnect = () => {
      setIsConnected(true);
      // H-5: re-join the session on reconnect (socket ID changes each time).
      // joinParamsRef is populated by handleConsent before the first connect.
      if (hasJoinedRef.current && joinParamsRef.current) {
        socket.emit('join-session', joinParamsRef.current);
      }
    };

    const onDisconnect = () => setIsConnected(false);

    // M-10: surface a non-recoverable connection failure in the UI.
    const onReconnectFailed = () => setReconnectFailed(true);

    const onSessionJoined = (data: {
      sessionId: string;
      myId: string;
      participants: Participant[];
      expiresAt: number;
      sessionName: string;
      messages: ChatMessage[];
      isHost: boolean;
      hostId: string;
      venuePoints: VenuePoint[];
    }) => {
      const map: Record<string, Participant> = {};
      data.participants.forEach(p => { map[p.id] = p; });
      setSession({
        sessionId:    data.sessionId,
        myId:         data.myId,
        participants: map,
        expiresAt:    data.expiresAt,
        sessionName:  data.sessionName,
        hostId:       data.hostId,
        venuePoints:  data.venuePoints ?? [],
      });
      // QUAL-04: expiresAt and sessionName are derived from session — no separate setState needed.
      setChatMessages(data.messages || []);
      setAmHost(data.isHost);
      // H-4: clear the pending password from memory once the server confirms we joined.
      setPendingPassword('');
      hasJoinedRef.current = true;
      addToHistory({ sessionId: data.sessionId, sessionName: data.sessionName, joinedAt: Date.now() });
    };

    const onVenuePointsUpdated = ({ venuePoints }: { venuePoints: VenuePoint[] }) => {
      setSession(prev => prev ? { ...prev, venuePoints } : prev);
    };

    const onParticipantJoined = ({ participant }: { participant: Participant }) => {
      setSession(prev => prev
        ? { ...prev, participants: { ...prev.participants, [participant.id]: participant } }
        : prev);
    };

    const onParticipantMoved = ({ participant }: { participant: Participant }) => {
      setSession(prev => prev
        ? { ...prev, participants: { ...prev.participants, [participant.id]: participant } }
        : prev);
    };

    const onParticipantLeft = ({ participantId }: { participantId: string }) => {
      setSession(prev => {
        if (!prev) return prev;
        const participants = { ...prev.participants };
        delete participants[participantId];
        return { ...prev, participants };
      });
      notifiedRef.current.delete(participantId);
    };

    const onParticipantStatus = ({ participantId, online }: { participantId: string; online: boolean }) => {
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
    };

    const onChatMessage = ({ message }: { message: ChatMessage }) => {
      setChatMessages(prev => [...prev, message]);
      if (!showChatRef.current) setUnreadCount(c => c + 1);
    };

    const onError = ({ message, code }: { message: string; code?: string }) => {
      if (code === 'WRONG_PASSWORD' || message === 'Incorrect password') {
        setPasswordError('Wrong password. Try again.');
        setPendingPassword('');
        setShowConsent(false);
        setShowPasswordModal(true);
      } else {
        // Surface every other server error (session full, expired, rate-limited,
        // generic join failure) instead of leaving the user on an endless spinner.
        console.error('Socket:', message);
        setJoinError(message || 'Something went wrong. Please try again.');
      }
    };

    const onSessionEnded = () => {
      setSessionEnded(true);
      // Session is gone — drop the stored host token so we don't recreate it on revisit.
      try { localStorage.removeItem(HOST_TOKEN_KEY(sessionId)); } catch { /* ignore */ }
      sessionEndTimerRef.current = setTimeout(() => navigate('/'), 3000);
    };

    socket.on('connect',              onConnect);
    socket.on('disconnect',           onDisconnect);
    socket.on('session-joined',       onSessionJoined);
    socket.on('venue-points-updated', onVenuePointsUpdated);
    socket.on('participant-joined',   onParticipantJoined);
    socket.on('participant-moved',    onParticipantMoved);
    socket.on('participant-left',     onParticipantLeft);
    socket.on('participant-status',   onParticipantStatus);
    socket.on('chat-message',         onChatMessage);
    socket.on('error',                onError);
    socket.on('session-ended',        onSessionEnded);
    // M-10: socket.io manager-level event for permanent failure
    socket.io.on('reconnect_failed',  onReconnectFailed);

    return () => {
      // H-3: pass the exact handler reference so only our listener is removed.
      socket.off('connect',              onConnect);
      socket.off('disconnect',           onDisconnect);
      socket.off('session-joined',       onSessionJoined);
      socket.off('venue-points-updated', onVenuePointsUpdated);
      socket.off('participant-joined',   onParticipantJoined);
      socket.off('participant-moved',    onParticipantMoved);
      socket.off('participant-left',     onParticipantLeft);
      socket.off('participant-status',   onParticipantStatus);
      socket.off('chat-message',         onChatMessage);
      socket.off('error',                onError);
      socket.off('session-ended',        onSessionEnded);
      socket.io.off('reconnect_failed',  onReconnectFailed);

      if (sessionEndTimerRef.current) clearTimeout(sessionEndTimerRef.current);

      // M-5: guard against double-disconnect (Leave button also calls disconnect).
      if (!disconnectedRef.current && socket.connected) {
        disconnectedRef.current = true;
        socket.emit('leave-session');
        socket.disconnect();
      }
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [sessionId, navigate]);

  // Auto-dismiss post-join action errors (e.g. host-only actions) after a few seconds.
  useEffect(() => {
    if (!joinError || !session) return;
    const t = setTimeout(() => setJoinError(null), 4000);
    return () => clearTimeout(t);
  }, [joinError, session]);

  const arrivalTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear arrival timers only on unmount. We intentionally read the ref's *current* value
  // at unmount (the live timer list), so the lint "ref may have changed" hint doesn't apply.
  useEffect(() => {
    const timers = arrivalTimersRef;
    return () => { timers.current.forEach(clearTimeout); };
  }, []);

  // "Arrived" detection + haptic
  useEffect(() => {
    if (!session) return;

    if (session.venuePoints.length > 0) {
      // ── Venue mode: fire when any participant reaches a venue point ──────────
      for (const p of Object.values(session.participants)) {
        // L-9: strict null check — !p.lat would suppress lat=0 (equator)
        if (p.lat === null || p.lng === null) continue;
        for (const venue of session.venuePoints) {
          const key = `${p.id}:${venue.id}`;
          if (notifiedRef.current.has(key)) continue;
          if (haversineKm(p.lat, p.lng, venue.lat, venue.lng) < ARRIVED_THRESHOLD_KM) {
            notifiedRef.current.add(key);
            const who = p.id === session.myId ? 'You' : p.name;
            const msg = `${who} arrived at ${venue.label}!`;
            // L-2: use a unique id per toast so React keys never collide even when
            // the same message appears twice (e.g. two participants, same venue name).
            const id  = crypto.randomUUID();
            setArrivals(prev => [...prev, { id, msg }]);
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            const t = setTimeout(() => {
              setArrivals(prev => prev.filter(a => a.id !== id));
            }, 5000);
            arrivalTimersRef.current.push(t);
          }
        }
      }
    } else {
      // ── No venue: fire when another participant gets near me ─────────────────
      const me = session.participants[session.myId];
      // COR-05: Check !me first, then lat/lng nulls (correct null-guard order).
      if (!me || me.lat === null || me.lng === null) return;

      for (const p of Object.values(session.participants)) {
        // L-9: strict null check
        if (p.id === session.myId || p.lat === null || p.lng === null) continue;
        if (haversineKm(me.lat, me.lng, p.lat, p.lng) < ARRIVED_THRESHOLD_KM
            && !notifiedRef.current.has(p.id)) {
          notifiedRef.current.add(p.id);
          const msg = `${p.name} has arrived!`;
          const id  = crypto.randomUUID(); // L-2
          setArrivals(prev => [...prev, { id, msg }]);
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
          const t = setTimeout(() => {
            setArrivals(prev => prev.filter(a => a.id !== id));
            notifiedRef.current.delete(p.id);
          }, 5000);
          arrivalTimersRef.current.push(t);
        }
      }
    }
  // PERF-03: Depend only on participants/venuePoints/myId to avoid re-running on
  // unrelated state changes (chat messages, connection status, etc.).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.participants, session?.venuePoints, session?.myId]);

  const startLocationWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      pos => {
        let lat = pos.coords.latitude;
        let lng = pos.coords.longitude;
        // M-6: use the stable per-session approximator (not a stateless snap) so
        // the same real position maps to different grid cells across sessions.
        if (approxRef.current && approxFnRef.current) {
          const a = approxFnRef.current(lat, lng);
          lat = a.lat;
          lng = a.lng;
        }
        const accuracy = approxRef.current ? 500 : pos.coords.accuracy;
        socket.emit('location-update', {
          lat,
          lng,
          accuracy,
          heading:  pos.coords.heading,
          speed:    pos.coords.speed,
        });
        // Optimistically render our own marker immediately instead of waiting for the
        // server to echo it back (which is throttled to ~2s). The echo will reconcile.
        setSession(prev => {
          const me = prev?.participants[prev.myId];
          if (!prev || !me) return prev;
          return {
            ...prev,
            participants: {
              ...prev.participants,
              [prev.myId]: {
                ...me, lat, lng, accuracy,
                heading: pos.coords.heading, speed: pos.coords.speed,
                lastUpdate: Date.now(), lastSeen: Date.now(),
              },
            },
          };
        });
        setGeoError(null);
      },
      err => {
        if (err.code === err.PERMISSION_DENIED)
          setGeoError("Location permission denied. Others can't see you on the map.");
        else if (err.code === err.TIMEOUT)
          setGeoError("Location timed out. Check your GPS signal and try again.");
        else
          setGeoError("Location unavailable. Check your device settings.");
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
    // M-6: create a fresh per-session approximator seeded with a random UUID so
    // the same GPS coordinate hashes to a different grid cell each session.
    if (approxMode) {
      approxFnRef.current = makeApproximator(crypto.randomUUID());
    } else {
      approxFnRef.current = null;
    }
    setShowConsent(false);

    // COR-06: Read hostState from ref so this callback doesn't recreate on every render.
    const hs = hostStateRef.current;
    const token = hostTokenRef.current;

    // H-5: persist join params so the reconnect handler in the socket effect can
    // re-emit join-session if the socket drops and re-establishes.
    // A host (fresh create OR returning via stored token) sends the host config incl.
    // the hostToken so the server re-grants host and skips the password on rejoin.
    const params = token
      ? {
          sessionId,
          name,
          clientId: clientIdRef.current,
          config: {
            name:            hs?.sessionName     || '',
            password:        hs?.password        || '',
            expiryHours:     hs?.expiryHours     ?? 2,
            maxParticipants: hs?.maxParticipants ?? 20,
            venuePoints:     hs?.venuePoints     ?? [],
            hostToken:       token,
          },
        }
      : {
          sessionId,
          name,
          clientId: clientIdRef.current,
          password: pendingPassword || undefined,
        };
    joinParamsRef.current = params;

    // Persist the host token so a full page refresh can still reclaim host.
    if (token && sessionId) {
      try { localStorage.setItem(HOST_TOKEN_KEY(sessionId), token); } catch { /* storage full/blocked */ }
    }
    // Persist host config (name + password) so the Share modal still works after a refresh.
    // sessionStorage (not localStorage) keeps it ephemeral — cleared when the tab closes.
    if (hs?.isHost && sessionId) {
      try {
        sessionStorage.setItem(`converge_hostcfg_${sessionId}`, JSON.stringify({
          sessionName: hs.sessionName ?? '', password: hs.password ?? '',
        }));
      } catch { /* ignore */ }
    }

    const doJoin = () => socket.emit('join-session', params);

    if (socket.connected) {
      doJoin();
    } else {
      // COR-07: Guard socket.once so it only fires on first join, not reconnects.
      // Reconnects are handled by onConnect in the socket effect (which checks hasJoinedRef).
      if (!hasJoinedRef.current) {
        socket.once('connect', doJoin);
      }
      socket.connect();
    }
    startLocationWatch();
  // COR-06: Remove hostState from deps — read it via hostStateRef.current instead.
  }, [sessionId, startLocationWatch, pendingPassword]);

  const sessionUrl  = `${window.location.origin}/session/${sessionId}`;
  // PERF-04: Memoize participants array so downstream components don't re-render on unrelated state changes.
  const participants = useMemo(
    () => session ? Object.values(session.participants) : [],
    [session],
  );
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
          <span className="font-bold text-white text-sm">Converge</span>
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

          {/* Venue editor (host only) */}
          {session && amHost && (
            <button
              onClick={() => { setDraftVenuePoints(session.venuePoints); setShowVenueEditor(true); }}
              className="w-9 h-9 flex items-center justify-center bg-[#1e293b] hover:bg-[#334155] text-white rounded-xl transition-colors text-base"
              aria-label="Edit venue points"
              title="Venue points"
            >
              📍
            </button>
          )}

          {/* Leave session (guests only) */}
          {session && !amHost && (
            <button
              onClick={() => {
                // M-5: set the guard so the useEffect cleanup doesn't also disconnect.
                disconnectedRef.current = true;
                socket.emit('leave-session');
                socket.disconnect();
                navigate('/');
              }}
              className="text-xs font-bold px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors border border-slate-700/50"
            >
              Leave
            </button>
          )}

          {/* End session (host only) */}
          {session && amHost && (
            confirmEnd ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { socket.emit('end-session'); setConfirmEnd(false); }}
                  className="text-xs font-bold px-2 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                >
                  End
                </button>
                <button
                  onClick={() => setConfirmEnd(false)}
                  className="text-xs font-bold px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEnd(true)}
                className="text-xs font-bold px-3 py-2 bg-red-900/70 hover:bg-red-700 text-red-300 hover:text-white rounded-xl transition-colors border border-red-800/50"
              >
                End
              </button>
            )
          )}
        </div>
      </header>

      {/* ── Disconnected banner ── */}
      {session && !isConnected && (
        <div role="status" aria-live="polite" className="flex-shrink-0 bg-red-500/90 text-white text-xs font-medium text-center py-2 px-4 flex items-center justify-center gap-2 z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          Reconnecting… your location isn't updating.
        </div>
      )}

      {/* ── Map ── */}
      <div className="flex-1 relative min-h-0">
        {session ? (
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-[#1e293b]">
              <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <MeetMap
              participants={participants}
              myId={session.myId}
              venuePoints={session.venuePoints}
            />
          </Suspense>
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
          <div role="status" aria-live="polite" className="absolute bottom-4 left-4 right-4 bg-amber-500/90 backdrop-blur-sm text-white text-sm rounded-xl px-4 py-3 shadow-lg z-20">
            ⚠️ {geoError}
          </div>
        )}

        {/* Post-join action error toast (e.g. host-only actions) */}
        {joinError && session && (
          <div role="alert" className="absolute bottom-4 left-4 right-4 bg-red-500/90 backdrop-blur-sm text-white text-sm rounded-xl px-4 py-3 shadow-lg z-20 flex items-center gap-2">
            <span>⚠️</span>
            <span className="flex-1">{joinError}</span>
            <button onClick={() => setJoinError(null)} aria-label="Dismiss" className="text-white/80 hover:text-white">✕</button>
          </div>
        )}

        {/* Arrived toasts — fixed so pinch-zoom / layout shifts don't displace them */}
        {arrivals.length > 0 && (
          <div role="status" aria-live="assertive" className="fixed top-[72px] left-4 right-4 flex flex-col gap-2 z-[2000] pointer-events-none">
            {/* L-2: key on unique id, not message text, to avoid collisions */}
            {arrivals.map(a => (
              <div key={a.id} className="slide-up bg-emerald-500 text-white text-sm font-semibold rounded-2xl px-4 py-3 shadow-lg flex items-center gap-2">
                <span className="text-lg">🎉</span>
                <span>{a.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Participant list ── */}
      {session && (
        <div className="flex-shrink-0 bg-[#0f172a]/95 backdrop-blur-sm border-t border-slate-800/60">
          <ParticipantList participants={participants} myId={session.myId} hostId={session.hostId} />
        </div>
      )}

      {/* SEC-06: Fetch error state — shown instead of consent when server unreachable */}
      {fetchError && !showConsent && !showPasswordModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e293b] rounded-2xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-white text-xl font-bold mb-2">Connection Error</h2>
            <p className="text-slate-400 text-sm mb-6">{fetchError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Join error overlay — shown when a join attempt fails before we ever connect
          (session full, rate-limited, expired, or a generic failure) so the user isn't
          left staring at an endless "Connecting…" spinner. */}
      {joinError && !session && !sessionEnded && !sessionExpired && !reconnectFailed && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e293b] rounded-2xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">🚫</div>
            <h2 className="text-white text-xl font-bold mb-2">Couldn't join</h2>
            <p className="text-slate-400 text-sm mb-6">{joinError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full mt-2 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold rounded-xl transition-colors text-sm"
            >
              Back to Home
            </button>
          </div>
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
          password={amHost ? sharePassword : undefined}
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

      {/* Venue editor modal (host only) */}
      {showVenueEditor && session && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 backdrop-blur-sm">
          {/* A11Y-05: dialog role and aria-labelledby for screen readers */}
          <div ref={venueEditorRef} role="dialog" aria-modal="true" aria-labelledby="venue-editor-title" className="bg-[#0f172a] rounded-t-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800/60 flex-shrink-0">
              <div>
                <h2 id="venue-editor-title" className="text-white font-bold text-base">Venue Points</h2>
                <p className="text-slate-500 text-xs mt-0.5">Pre-set meetup spots visible to everyone</p>
              </div>
              <button
                onClick={() => setShowVenueEditor(false)}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white bg-slate-800 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <Suspense fallback={
                <div className="h-[180px] flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              }>
                <VenuePicker venuePoints={draftVenuePoints} onChange={setDraftVenuePoints} />
              </Suspense>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-slate-800/60 flex-shrink-0">
              <button
                onClick={() => setShowVenueEditor(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  socket.emit('update-venue-points', { points: draftVenuePoints });
                  setShowVenueEditor(false);
                }}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session ended overlay */}
      {sessionEnded && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e293b] rounded-2xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">🏁</div>
            <h2 className="text-white text-xl font-bold mb-2">Session Ended</h2>
            <p className="text-slate-400 text-sm">The host has ended this session. Redirecting you home…</p>
          </div>
        </div>
      )}

      {/* Session expired overlay */}
      {sessionExpired && !sessionEnded && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e293b] rounded-2xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">⏱</div>
            <h2 className="text-white text-xl font-bold mb-2">Session Expired</h2>
            <p className="text-slate-400 text-sm mb-6">This session has reached its time limit.</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}

      {/* M-10: Reconnect-failed overlay — shown when socket.io exhausts all
           reconnection attempts (reconnectionAttempts=5 in socket.ts).           */}
      {reconnectFailed && !sessionEnded && !sessionExpired && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1e293b] rounded-2xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">📡</div>
            <h2 className="text-white text-xl font-bold mb-2">Connection Lost</h2>
            <p className="text-slate-400 text-sm mb-6">
              Unable to reconnect to the server after several attempts.
              Check your internet connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full mt-2 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold rounded-xl transition-colors text-sm"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
