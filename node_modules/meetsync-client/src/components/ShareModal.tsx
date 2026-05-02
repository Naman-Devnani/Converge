import { useState } from 'react';

interface Props {
  sessionUrl: string;
  onClose: () => void;
}

export default function ShareModal({ sessionUrl, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sessionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select input text
    }
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: 'MeetSync — join my meetup', url: sessionUrl });
    } else {
      copy();
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="slide-up bg-[#1e293b] rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
            🔗
          </div>
          <div>
            <h2 className="font-bold text-white">Invite people</h2>
            <p className="text-slate-400 text-sm">Anyone with this link can join your session</p>
          </div>
        </div>

        {/* URL display */}
        <div className="bg-[#0f172a] rounded-xl p-3 mb-4 flex items-center gap-2">
          <p className="flex-1 text-slate-300 text-sm font-mono truncate">{sessionUrl}</p>
        </div>

        <div className="flex gap-3 mb-4">
          <button
            onClick={copy}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-[#334155] hover:bg-[#475569] text-white'
            }`}
          >
            {copied ? '✓ Copied!' : '📋 Copy link'}
          </button>
          <button
            onClick={share}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
          >
            📤 Share
          </button>
        </div>

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
