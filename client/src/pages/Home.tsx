import { useState, useRef, lazy, Suspense, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { generatePassword } from '../utils/password';
import { getHistory, removeFromHistory } from '../utils/history';
import type { VenuePoint } from '../types';

const VenuePicker = lazy(() => import('../components/VenuePicker'));
const MapFallback = () => (
  <div className="h-[180px] rounded-lg bg-surface-container-highest flex items-center justify-center">
    <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
  </div>
);

function genSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

// Magical dissolve — brand-colored glowing sparkles that rise and twinkle out.
const MAGIC_COLORS = ['#34d399', '#6ffbbe', '#2dd4bf', '#b76dff', '#ddb7ff', '#4d8eff'];
interface Particle { id: number; left: number; top: number; size: number; color: string; dx: number; dy: number; delay: number; dur: number; }
function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: 4 + Math.random() * 8,
    color: MAGIC_COLORS[Math.floor(Math.random() * MAGIC_COLORS.length)],
    dx: (Math.random() - 0.5) * 100,
    dy: -35 - Math.random() * 80,
    delay: Math.random() * 0.25,
    dur: 0.7 + Math.random() * 0.45,
  }));
}

const EXPIRY_OPTIONS = [
  { label: '1 hour', value: 1 }, { label: '2 hours', value: 2 }, { label: '4 hours', value: 4 },
  { label: '8 hours', value: 8 }, { label: '24 hours', value: 24 },
];

const STEPS = [
  { icon: 'add_circle', tone: 'secondary', title: '1. Create a room',  desc: 'Set your preferences and name your session. No login required.' },
  { icon: 'share',      tone: 'primary',   title: '2. Share the link', desc: 'Send the auto-generated link to your friends — any app works.' },
  { icon: 'distance',   tone: 'tertiary',  title: '3. See each other', desc: 'View live locations on a map and meet up easily.' },
];

const BADGES = [
  { icon: 'person_off',  tone: 'text-secondary', title: 'No account',  sub: 'Anonymity by default' },
  { icon: 'location_off',tone: 'text-primary',   title: 'No tracking', sub: 'Nothing stored after the session' },
  { icon: 'code',        tone: 'text-tertiary',  title: 'Open source', sub: 'Inspect the code yourself' },
  { icon: 'timer_off',   tone: 'text-secondary', title: 'Ephemeral',   sub: 'Sessions self-expire' },
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
  const [dissolvingId, setDissolvingId] = useState<string | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Magical removal: the row fades & lifts while a burst of colorful glowing sparkles
  // rises and twinkles out, then the entry is dropped. Respects reduced-motion.
  function handleRemove(id: string) {
    if (dissolvingId) return; // one at a time
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { removeFromHistory(id); setHistory(getHistory()); return; }
    particlesRef.current = makeParticles(42);
    setDissolvingId(id);
    window.setTimeout(() => {
      removeFromHistory(id);
      setHistory(getHistory());
      setDissolvingId(null);
    }, 800);
  }

  function createMeetup() {
    const sessionId = genSessionId();
    navigate(`/session/${sessionId}`, {
      state: {
        isHost: true,
        hostToken: crypto.randomUUID(),
        sessionName: sessionName.trim(),
        password: password.trim(),
        expiryHours,
        maxParticipants: maxPeople,
        venuePoints: venueMode ? venuePoints : [],
      },
    });
  }

  const fieldCls = 'w-full bg-surface-container-highest border-none rounded-lg focus:ring-2 focus:ring-secondary text-body-md py-md px-lg text-on-surface placeholder:text-on-surface-variant/50 outline-none';
  const labelCls = 'text-label-md uppercase tracking-wider text-on-surface-variant block mb-sm';

  return (
    <div className="relative min-h-screen bg-background text-on-background overflow-x-hidden">
      {/* Ambient animated background — drifting blurred orbs fill the empty side gutters */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="bg-orb" style={{ width: '42vw', height: '42vw', background: '#b76dff', top: '-10vh', left: '-8vw', animation: 'orb-a 24s ease-in-out infinite' }} />
        <div className="bg-orb" style={{ width: '38vw', height: '38vw', background: '#4edea3', top: '18vh', right: '-10vw', animation: 'orb-b 28s ease-in-out infinite' }} />
        <div className="bg-orb" style={{ width: '34vw', height: '34vw', background: '#4d8eff', bottom: '-12vh', left: '12vw', animation: 'orb-c 32s ease-in-out infinite' }} />
      </div>

      {/* Top app bar */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-white/10 shadow-[0_20px_50px_rgba(183,109,255,0.15)] py-md px-container-margin">
        <div className="flex items-center gap-sm">
          <img alt="Converge" className="w-8 h-8 object-contain rounded-lg" src="/icons/icon.png" />
          <span className="text-headline-lg-mobile font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary leading-tight">Converge</span>
        </div>
      </header>

      <main className="relative z-10 max-w-md mx-auto px-container-margin pb-xxl space-y-xxl pt-xl">
        {/* Hero */}
        <section className="text-center space-y-md">
          <h1 className="text-display-lg-mobile tracking-tighter">
            Meet people,<br/><span className="text-secondary">not complications.</span>
          </h1>
          <p className="text-on-surface-variant text-body-lg px-4">
            Privacy-first coordination for the real world. No accounts, no tracking — just meeting.
          </p>
          <div className="pt-md">
            <button
              onClick={createMeetup}
              className="w-full py-lg rounded-full bg-gradient-to-r from-primary to-secondary text-on-primary text-headline-md font-bold glow-shadow-emerald hover:scale-[1.02] active:scale-95 transition-all duration-300"
            >
              Create Meetup
            </button>
          </div>

          {/* Advanced settings */}
          <div className="pt-sm">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center justify-center gap-xs mx-auto text-label-md text-on-surface-variant hover:text-primary transition-colors py-sm"
            >
              <span className={`material-symbols-outlined transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>expand_more</span>
              Advanced settings
            </button>

            <div className={`collapsible-content text-left ${showAdvanced ? 'open' : ''}`}>
              <div className="overflow-hidden">
              <div className="glass-card rounded-xl p-lg mt-md space-y-lg shadow-xl">
                <div>
                  <label className={labelCls}>Session Name</label>
                  <input type="text" value={sessionName} onChange={e => setSessionName(e.target.value)} maxLength={60} placeholder="e.g. Quick Coffee" className={fieldCls} />
                </div>

                <div>
                  <label className={labelCls}>Optional Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} maxLength={64} placeholder="••••••••" className={`${fieldCls} pr-28`} />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-sm">
                      <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)} className="p-xs text-on-surface-variant hover:text-secondary">
                        <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                      <button type="button" onClick={() => { setPassword(generatePassword()); setShowPassword(true); }} className="bg-secondary-container/20 text-secondary text-xs px-sm py-xs rounded font-bold">GENERATE</button>
                    </div>
                  </div>
                  {password && <p className="text-xs text-primary mt-sm">Share the password separately — not in the link.</p>}
                </div>

                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <label className={labelCls}>Expires after</label>
                    <select value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))} className={fieldCls}>
                      {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Max people</label>
                    <select value={maxPeople} onChange={e => setMaxPeople(Number(e.target.value))} className={fieldCls}>
                      {[2,5,10,15,20,30,50].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between py-sm border-t border-white/5">
                  <div className="flex flex-col">
                    <span className="text-headline-md text-on-surface">Venue mode</span>
                    <span className="text-xs text-on-surface-variant">Pre-set one or more meetup points</span>
                  </div>
                  <button type="button" aria-label="Toggle venue mode" aria-pressed={venueMode} onClick={() => { setVenueMode(v => !v); if (venueMode) setVenuePoints([]); }} className={`w-12 h-6 rounded-full p-1 transition-colors relative flex-shrink-0 ${venueMode ? 'bg-secondary' : 'bg-surface-container-highest'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${venueMode ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
                {venueMode && (
                  <Suspense fallback={<MapFallback />}><VenuePicker venuePoints={venuePoints} onChange={setVenuePoints} /></Suspense>
                )}
              </div>
              </div>
            </div>
          </div>
        </section>

        {/* Recent sessions */}
        {history.length > 0 && (
          <section className="space-y-lg">
            <h2 className="text-headline-lg-mobile flex items-center gap-sm">
              <span className="material-symbols-outlined text-secondary">history</span> Recent sessions
            </h2>
            <div className="space-y-md">
              {history.map(entry => {
                const dissolving = dissolvingId === entry.sessionId;
                return (
                <div key={entry.sessionId} className={`glass-card p-md rounded-xl relative transition-transform duration-200 ${dissolving ? 'pointer-events-none' : 'active:scale-[0.98] sm:hover:border-secondary/30'}`}>
                  <div className={`flex items-center justify-between ${dissolving ? 'magic-dissolving' : ''}`}>
                    <div className="flex items-center gap-md min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary flex-shrink-0">
                        <span className="material-symbols-outlined">location_on</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-headline-md text-on-surface truncate">{entry.sessionName || 'Unnamed session'}</p>
                        <p className="text-label-md text-on-surface-variant">{timeAgo(entry.joinedAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-sm flex-shrink-0">
                      <button onClick={() => navigate(`/session/${entry.sessionId}`)} className="bg-secondary/10 text-secondary text-sm font-bold px-md py-sm rounded-lg hover:bg-secondary hover:text-on-secondary active:scale-95 transition-all">Rejoin</button>
                      <button onClick={() => handleRemove(entry.sessionId)} aria-label="Remove" className="p-xs text-on-surface-variant hover:text-error transition-colors">
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    </div>
                  </div>
                  {dissolving && (
                    <div className="absolute inset-0 z-10 pointer-events-none" style={{ overflow: 'visible' }}>
                      {particlesRef.current.map(p => (
                        <span key={p.id} className="magic-particle" style={{
                          left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size,
                          background: p.color, boxShadow: `0 0 ${p.size * 3}px ${p.color}, 0 0 ${p.size}px #fff`,
                          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
                          ['--dx']: `${p.dx}px`, ['--dy']: `${p.dy}px`,
                        } as CSSProperties}/>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </section>
        )}

        {/* How it works */}
        <section className="space-y-lg">
          <h2 className="text-headline-lg-mobile text-center">How it works</h2>
          <div className="space-y-xl">
            {STEPS.map(s => (
              <div key={s.title} className="flex flex-col items-center text-center gap-md">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
                  s.tone === 'secondary' ? 'bg-secondary text-on-secondary glow-shadow-emerald'
                  : s.tone === 'primary' ? 'bg-primary text-on-primary glow-shadow-purple'
                  : 'bg-tertiary text-on-tertiary'}`}>
                  <span className="material-symbols-outlined text-[32px]">{s.icon}</span>
                </div>
                <div>
                  <h3 className="text-headline-md text-on-surface">{s.title}</h3>
                  <p className="text-on-surface-variant text-body-md max-w-xs">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust badges */}
        <section className="grid grid-cols-2 gap-md">
          {BADGES.map(b => (
            <div key={b.title} className="glass-card p-lg rounded-2xl text-center space-y-sm transition-transform duration-300 sm:hover:scale-[1.03] active:scale-[0.98]">
              <span className={`material-symbols-outlined text-[32px] ${b.tone}`}>{b.icon}</span>
              <p className="text-headline-md">{b.title}</p>
              <p className="text-xs text-on-surface-variant">{b.sub}</p>
            </div>
          ))}
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full bg-surface-container-lowest border-t border-white/5 flex flex-col items-center gap-2 px-container-margin py-xl text-center">
        <span className="text-base font-bold tracking-[0.18em] uppercase text-on-surface/85">Converge</span>
        <p className="text-xs text-on-surface-variant/55">Privacy-first · open-source · ephemeral by design</p>
        <p className="text-[11px] text-on-surface-variant/35">© {new Date().getFullYear()} Converge · MIT</p>
      </footer>
    </div>
  );
}
