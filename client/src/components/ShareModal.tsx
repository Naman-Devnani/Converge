import { useState } from 'react';

interface Props {
  sessionUrl: string;
  password?: string;
  onClose: () => void;
}

export default function ShareModal({ sessionUrl, password, onClose }: Props) {
  const [copiedLink, setCopiedLink]     = useState(false);
  const [copiedPass, setCopiedPass]     = useState(false);
  const [showPass,   setShowPass]       = useState(false);

  async function copy(text: string, which: 'link' | 'pass') {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    if (which === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2500);
    }
  }

  function shareViaWhatsApp() {
    const msg = encodeURIComponent(`Join my MeetSync meetup → ${sessionUrl}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="slide-up bg-[#1e293b] rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🔗</div>
          <div>
            <h2 className="font-bold text-white">Invite people</h2>
            <p className="text-slate-400 text-sm">Anyone with this link can join</p>
          </div>
        </div>

        {/* Link row */}
        <div className="bg-[#0f172a] rounded-xl p-3 mb-3 flex items-center gap-2">
          <p className="flex-1 text-slate-300 text-sm font-mono truncate">{sessionUrl}</p>
        </div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => copy(sessionUrl, 'link')}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${copiedLink ? 'bg-emerald-600 text-white' : 'bg-[#334155] hover:bg-[#475569] text-white'}`}
          >
            {copiedLink ? '✓ Copied!' : '📋 Copy link'}
          </button>
          <button
            onClick={shareViaWhatsApp}
            className="flex-1 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20c45a] text-white font-semibold text-sm transition-colors"
          >
            WhatsApp
          </button>
        </div>

        {/* Password section */}
        {password && (
          <div className="mb-4 border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-400 text-sm font-semibold">🔒 Session password</span>
            </div>
            <div className="flex items-center gap-2 bg-[#0f172a] rounded-xl px-3 py-2.5 mb-2">
              <span className="flex-1 text-white font-mono text-sm tracking-wide">
                {showPass ? password : '••••••••••••'}
              </span>
              <button onClick={() => setShowPass(v => !v)} className="text-slate-500 hover:text-slate-300 text-sm">
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
            <button
              onClick={() => copy(password, 'pass')}
              className={`w-full py-2 rounded-xl font-semibold text-sm transition-all ${copiedPass ? 'bg-amber-600 text-white' : 'bg-[#334155] hover:bg-[#475569] text-white'}`}
            >
              {copiedPass ? '✓ Password copied!' : '📋 Copy password'}
            </button>
            <p className="text-amber-400/70 text-xs mt-2 text-center">
              Share the password separately — not in the same message as the link.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-[#0f172a] text-slate-400 hover:text-white font-medium text-sm transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
