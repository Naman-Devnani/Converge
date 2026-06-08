import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { generatePassword } from '../utils/password';
import { getHistory, removeFromHistory } from '../utils/history';
import type { VenuePoint } from '../types';

// Lazy-loaded: pulls in Leaflet (~heavy). Only needed when Venue mode is enabled, so it
// stays out of the initial Home bundle.
const VenuePicker = lazy(() => import('../components/VenuePicker'));
const MapFallback = () => (
  <div className="h-[180px] rounded-xl bg-[#0f172a] border border-slate-700 flex items-center justify-center">
    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

function genSessionId(): string {
  // QUAL-01: Entropy note — 12 hex chars from UUID = 48 bits, intentional for short readable IDs.
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

const EXPIRY_OPTIONS = [
  { label: '1 hour',  value: 1  },
  { label: '2 hours', value: 2  },
  { label: '4 hours', value: 4  },
  { label: '8 hours', value: 8  },
  { label: '24 hours',value: 24 },
];

export default function Home() {
  const navigate = useNavigate();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sessionName,  setSessionName]  = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expiryHours,  setExpiryHours]  = useState(2);
  const [maxPeople,    setMaxPeople]    = useState(20);
  const [venueMode,    setVenueMode]    = useState(false);
  const [venuePoints,  setVenuePoints]  = useState<VenuePoint[]>([]);
  const [history, setHistory] = useState(getHistory);

  function createMeetup() {
    const sessionId = genSessionId();
    navigate(`/session/${sessionId}`, {
      state: {
        isHost:          true,
        // Stable host secret so the creator can reclaim host across reconnect/refresh.
        hostToken:       crypto.randomUUID(),
        sessionName:     sessionName.trim(),
        password:        password.trim(),
        expiryHours,
        maxParticipants: maxPeople,
        venuePoints:     venueMode ? venuePoints : [],
      },
    });
  }

  function rejoin(sessionId: string) {
    navigate(`/session/${sessionId}`);
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 overflow-auto">
      <div className="max-w-md w-full">

        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-5">
            <img src="/icons/icon.png" alt="Converge Logo" width="96" height="96" className="rounded-3xl" />
          </div>
          <h1 className="text-5xl font-extrabold text-white tracking-tight">Converge</h1>
          <p className="text-slate-400 mt-3 text-lg">Meet people, not complications.</p>
        </div>

        {/* CTA */}
        <button
          onClick={createMeetup}
          className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-lg font-bold shadow-lg shadow-emerald-500/25 transition-all duration-150"
        >
          Create Meetup →
        </button>

        {/* Advanced settings toggle */}
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="w-full mt-3 py-2.5 rounded-xl text-slate-400 hover:text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          {showAdvanced ? 'Hide' : 'Advanced'} settings
        </button>

        {/* Advanced panel */}
        {showAdvanced && (
          <div className="mt-2 bg-[#1e293b] rounded-2xl p-4 space-y-4 border border-slate-700/40">

            {/* Session name */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                Session name <span className="text-slate-600 normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={e => setSessionName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Airport pickup, Festival group…"
                className="w-full bg-[#0f172a] border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-white placeholder-slate-600 text-sm transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
                Password <span className="text-slate-600 normal-case font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    maxLength={64}
                    placeholder="Leave blank for open session"
                    className="w-full bg-[#0f172a] border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-white placeholder-slate-600 text-sm pr-9 transition-colors"
                  />
                  {/* A11Y-07: aria-label for password visibility toggle */}
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? '🙈' : '👁'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
                  className="px-3 py-2.5 bg-[#0f172a] border border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Generate
                </button>
              </div>
              {password && (
                <p className="text-xs text-amber-400 mt-1.5">
                  ⚠ Share the password separately — don't include it in the link.
                </p>
              )}
            </div>

            {/* Expiry + Max people */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Expires after</label>
                <select
                  value={expiryHours}
                  onChange={e => setExpiryHours(Number(e.target.value))}
                  className="w-full bg-[#0f172a] border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-white text-sm transition-colors"
                >
                  {EXPIRY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Max people</label>
                <select
                  value={maxPeople}
                  onChange={e => setMaxPeople(Number(e.target.value))}
                  className="w-full bg-[#0f172a] border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-white text-sm transition-colors"
                >
                  {[2,5,10,15,20,30,50].map(n => (
                    <option key={n} value={n}>{n} people</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Venue Mode */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Venue mode
                  </label>
                  <p className="text-[11px] text-slate-600 mt-0.5">Pre-set one or more meetup points</p>
                </div>
                {/* A11Y-06: aria-label and aria-pressed for venue mode toggle */}
                <button
                  type="button"
                  aria-label="Toggle venue mode"
                  aria-pressed={venueMode}
                  onClick={() => { setVenueMode(v => !v); if (venueMode) setVenuePoints([]); }}
                  className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${venueMode ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${venueMode ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              {venueMode && (
                <Suspense fallback={<MapFallback />}>
                  <VenuePicker venuePoints={venuePoints} onChange={setVenuePoints} />
                </Suspense>
              )}
            </div>
          </div>
        )}

        {/* Recent sessions */}
        {history.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent sessions</p>
            <div className="space-y-2">
              {history.map(entry => (
                <div key={entry.sessionId} className="flex items-center gap-3 bg-[#1e293b] rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {entry.sessionName || 'Unnamed session'}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">{timeAgo(entry.joinedAt)}</p>
                  </div>
                  <button
                    onClick={() => rejoin(entry.sessionId)}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex-shrink-0"
                  >
                    Rejoin
                  </button>
                  <button
                    onClick={() => { removeFromHistory(entry.sessionId); setHistory(getHistory()); }}
                    className="w-7 h-7 flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-slate-700 rounded-lg flex-shrink-0 transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="mt-8 space-y-3">
          {[
            { icon: '🔗', title: 'Create a room',  desc: 'Tap the button — get a shareable link instantly.' },
            { icon: '📤', title: 'Share the link', desc: 'Send it via WhatsApp, iMessage, or any app.' },
            { icon: '🗺️', title: 'See each other', desc: 'Real-time map with everyone\'s live position.' },
          ].map(s => (
            <div key={s.title} className="flex items-start gap-4 bg-[#1e293b] rounded-2xl p-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#0f172a] flex items-center justify-center text-xl">{s.icon}</div>
              <div>
                <p className="font-semibold text-white text-sm">{s.title}</p>
                <p className="text-slate-400 text-sm mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {['No account', 'No tracking history', 'Open source', 'Ephemeral sessions'].map(b => (
            <span key={b} className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              ✓ {b}
            </span>
          ))}
        </div>

        <p className="text-center text-slate-600 text-xs mt-8">
          Converge · Privacy-first open-source meetup coordination
        </p>
      </div>
    </div>
  );
}
