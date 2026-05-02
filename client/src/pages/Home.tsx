import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generatePassword } from '../utils/password';
import { getHistory, removeFromHistory } from '../utils/history';

function genSessionId(): string {
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
  const history = getHistory();

  function createMeetup() {
    const sessionId = genSessionId();
    navigate(`/session/${sessionId}`, {
      state: {
        isHost:      true,
        sessionName: sessionName.trim(),
        password:    password.trim(),
        expiryHours,
        maxParticipants: maxPeople,
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
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-emerald-500 mb-5 shadow-lg shadow-emerald-500/30">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
          </div>
          <h1 className="text-5xl font-extrabold text-white tracking-tight">MeetSync</h1>
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
                  <button
                    type="button"
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
                    onClick={() => removeFromHistory(entry.sessionId)}
                    className="text-slate-600 hover:text-slate-400 flex-shrink-0 text-sm"
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
          MeetSync · Privacy-first open-source meetup coordination
        </p>
      </div>
    </div>
  );
}
