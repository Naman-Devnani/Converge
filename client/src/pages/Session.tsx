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
      className="fixed inset-0 flex flex-col bg-background"
      style={{
        paddingTop:    'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between gap-3 px-3 sm:px-container-margin py-md bg-background/80 backdrop-blur-xl z-20 flex-shrink-0 border-b border-white/10 shadow-[0_20px_50px_rgba(221,183,255,0.10)]">
        <div className="flex items-center gap-2 sm:gap-md min-w-0">
          <button onClick={() => navigate('/')} aria-label="Back" className="material-symbols-outlined text-primary hover:opacity-80 active:scale-95 transition flex-shrink-0">arrow_back</button>
          <div className="flex flex-col min-w-0">
            <span className="text-base sm:text-headline-lg-mobile font-extrabold text-primary tracking-tight leading-none">Converge</span>
            {session && (sessionName || timeLeft) && (
              <div className="flex items-center gap-sm mt-0.5">
                {sessionName && <h1 className="text-label-md text-on-surface-variant truncate max-w-[110px]">{sessionName}</h1>}
                {timeLeft && (
                  <div className="bg-surface-container-highest/50 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                    <span className={`material-symbols-outlined text-[12px] ${expiringSoon ? 'text-amber-400' : 'text-tertiary'}`}>timer</span>
                    <span className={`text-[10px] font-bold ${expiringSoon ? 'text-amber-400' : 'text-tertiary'}`}>{timeLeft}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-sm flex-shrink-0">
          {/* Live count */}
          {session && (
            <div className="hidden sm:flex items-center bg-secondary/10 px-3 py-1.5 rounded-full border border-secondary/20">
              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${isConnected ? 'bg-secondary status-pulse' : 'bg-error'}`} />
              <span className="text-label-md text-secondary">{participants.length}<span className="hidden sm:inline"> Live</span></span>
            </div>
          )}

          {/* Chat */}
          {session && (
            <button onClick={() => { setShowChat(true); setUnreadCount(0); }} aria-label="Open chat" className="relative p-1.5 sm:p-2 rounded-full hover:bg-white/5 transition-colors active:scale-95">
              <span className="material-symbols-outlined text-on-surface">chat</span>
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-error text-on-error flex items-center justify-center text-[10px] font-bold rounded-full border border-background">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
          )}

          {/* Invite */}
          {session && (
            <button onClick={() => setShowShare(true)} className="px-3 sm:px-4 py-2 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary-container text-label-md rounded-full hover:opacity-90 active:scale-95 transition-all shadow-lg flex-shrink-0">Invite</button>
          )}

          {/* Venue editor (host) */}
          {session && amHost && (
            <button onClick={() => { setDraftVenuePoints(session.venuePoints); setShowVenueEditor(true); }} aria-label="Edit venue points" title="Venue points" className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 text-on-surface-variant hover:text-secondary transition-colors active:scale-95">
              <span className="material-symbols-outlined">edit</span>
            </button>
          )}

          {/* Leave (guest) */}
          {session && !amHost && (
            <button
              onClick={() => { disconnectedRef.current = true; socket.emit('leave-session'); socket.disconnect(); navigate('/'); }}
              className="px-3 sm:px-4 py-2 border-2 border-outline-variant/30 text-outline text-label-md rounded-full hover:bg-white/5 transition-all"
            >Leave</button>
          )}

          {/* End (host) */}
          {session && amHost && (
            confirmEnd ? (
              <div className="flex items-center gap-1">
                <button onClick={() => { socket.emit('end-session'); setConfirmEnd(false); }} className="text-label-md px-3 py-2 bg-error text-on-error rounded-full transition-colors">End</button>
                <button onClick={() => setConfirmEnd(false)} className="text-label-md px-3 py-2 bg-surface-container-high text-on-surface rounded-full transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmEnd(true)} className="px-3 sm:px-4 py-2 border-2 border-outline-variant/30 text-outline text-label-md rounded-full hover:bg-error/10 hover:text-error hover:border-error/30 transition-all">End</button>
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
            <div className="absolute inset-0 flex items-center justify-center bg-surface">
              <div className="w-12 h-12 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <MeetMap
              participants={participants}
              myId={session.myId}
              venuePoints={session.venuePoints}
            />
          </Suspense>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-secondary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-on-surface-variant text-body-md">Connecting…</p>
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
          <div role="status" aria-live="assertive" className="fixed top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-[2000] pointer-events-none">
            {arrivals.map(a => (
              <div key={a.id} className="arrival-pop bg-surface-container/90 backdrop-blur-lg border border-secondary/40 px-5 py-3 rounded-full flex items-center gap-3 shadow-2xl">
                <span className="bg-secondary/20 p-1 rounded-full flex"><span className="material-symbols-outlined text-secondary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></span>
                <span className="text-body-md text-on-surface whitespace-nowrap">{a.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Participant list ── */}
      {session && (
        <div className="flex-shrink-0 bg-surface-container/90 backdrop-blur-xl border-t border-white/10">
          <ParticipantList participants={participants} myId={session.myId} hostId={session.hostId} />
        </div>
      )}

      {/* SEC-06: Fetch error state — shown instead of consent when server unreachable */}
      {fetchError && !showConsent && !showPasswordModal && (
        <div className="fade-in fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-container border border-white/10 rounded-3xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-on-surface text-xl font-bold mb-2">Connection Error</h2>
            <p className="text-on-surface-variant text-sm mb-6">{fetchError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary-container font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all"
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
        <div className="fade-in fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-container border border-white/10 rounded-3xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">🚫</div>
            <h2 className="text-on-surface text-xl font-bold mb-2">Couldn't join</h2>
            <p className="text-on-surface-variant text-sm mb-6">{joinError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary-container font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all"
            >
              Try again
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full mt-2 py-3 bg-surface-container-high hover:bg-surface-bright text-on-surface font-semibold rounded-2xl transition-colors text-sm"
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
        <div className="fade-in fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* A11Y-05: dialog role and aria-labelledby for screen readers */}
          <div ref={venueEditorRef} role="dialog" aria-modal="true" aria-labelledby="venue-editor-title" className="slide-up bg-surface border-t sm:border border-white/10 rounded-t-[32px] sm:rounded-[32px] sm:mx-4 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-center pt-3 pb-1"><span className="w-10 h-1 rounded-full bg-outline-variant/50" /></div>
            {/* Header */}
            <div className="flex items-center justify-between px-lg pt-2 pb-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary">edit</span>
                <div>
                  <h2 id="venue-editor-title" className="text-on-surface text-headline-md">Venue points</h2>
                  <p className="text-on-surface-variant text-xs mt-0.5">Pre-set meetup spots visible to everyone</p>
                </div>
              </div>
              <button
                onClick={() => setShowVenueEditor(false)}
                className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:text-on-surface bg-surface-container-high rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-lg py-2">
              <Suspense fallback={
                <div className="h-[180px] flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                </div>
              }>
                <VenuePicker venuePoints={draftVenuePoints} onChange={setDraftVenuePoints} />
              </Suspense>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-white/10 flex-shrink-0">
              <button
                onClick={() => setShowVenueEditor(false)}
                className="flex-1 py-3 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded-2xl font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  socket.emit('update-venue-points', { points: draftVenuePoints });
                  setShowVenueEditor(false);
                }}
                className="flex-1 py-3 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary-container rounded-2xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session ended overlay */}
      {sessionEnded && (
        <div className="fade-in fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-container border border-white/10 rounded-3xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">🏁</div>
            <h2 className="text-on-surface text-xl font-bold mb-2">Session Ended</h2>
            <p className="text-on-surface-variant text-sm">The host has ended this session. Redirecting you home…</p>
          </div>
        </div>
      )}

      {/* Session expired overlay */}
      {sessionExpired && !sessionEnded && (
        <div className="fade-in fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-container border border-white/10 rounded-3xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">⏱</div>
            <h2 className="text-on-surface text-xl font-bold mb-2">Session Expired</h2>
            <p className="text-on-surface-variant text-sm mb-6">This session has reached its time limit.</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary-container font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}

      {/* M-10: Reconnect-failed overlay — shown when socket.io exhausts all
           reconnection attempts (reconnectionAttempts=5 in socket.ts).           */}
      {reconnectFailed && !sessionEnded && !sessionExpired && (
        <div className="fade-in fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-container border border-white/10 rounded-3xl px-8 py-10 text-center shadow-2xl max-w-xs w-full mx-4">
            <div className="text-4xl mb-4">📡</div>
            <h2 className="text-on-surface text-xl font-bold mb-2">Connection Lost</h2>
            <p className="text-on-surface-variant text-sm mb-6">
              Unable to reconnect to the server after several attempts.
              Check your internet connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary-container font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all"
            >
              Retry
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full mt-2 py-3 bg-surface-container-high hover:bg-surface-bright text-on-surface font-semibold rounded-2xl transition-colors text-sm"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
