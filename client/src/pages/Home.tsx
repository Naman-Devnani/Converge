import { useNavigate } from 'react-router-dom';

function genSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

const steps = [
  { n: 1, icon: '🔗', title: 'Create a room', desc: 'Tap the button — get a shareable link instantly.' },
  { n: 2, icon: '📤', title: 'Share the link', desc: 'Send it via WhatsApp, iMessage, or any app.' },
  { n: 3, icon: '🗺️', title: 'See each other', desc: 'Real-time map with everyone\'s live position.' },
];

export default function Home() {
  const navigate = useNavigate();

  function createMeetup() {
    navigate(`/session/${genSessionId()}`);
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 overflow-auto">
      <div className="max-w-md w-full">

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-emerald-500 mb-5 shadow-lg shadow-emerald-500/30">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
          </div>
          <h1 className="text-5xl font-extrabold text-white tracking-tight">MeetSync</h1>
          <p className="text-slate-400 mt-3 text-lg leading-relaxed">
            Meet people, not complications.<br/>
            <span className="text-slate-500 text-base">Temporary mutual live location — no app needed.</span>
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={createMeetup}
          className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-lg font-bold shadow-lg shadow-emerald-500/25 transition-all duration-150"
        >
          Create Meetup →
        </button>

        {/* How it works */}
        <div className="mt-10 space-y-4">
          {steps.map(s => (
            <div key={s.n} className="flex items-start gap-4 bg-[#1e293b] rounded-2xl p-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#0f172a] flex items-center justify-center text-xl">
                {s.icon}
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{s.title}</p>
                <p className="text-slate-400 text-sm mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Privacy badges */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {['No account', 'No tracking history', 'Open source', 'Ephemeral sessions'].map(badge => (
            <span key={badge} className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              ✓ {badge}
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
