import { useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';

interface Props {
  sessionUrl: string;
  password?: string;
  onClose: () => void;
}

export default function ShareModal({ sessionUrl, password, onClose }: Props) {
  const [copiedLink, setCopiedLink]     = useState(false);
  const [copiedPass, setCopiedPass]     = useState(false);
  const [showPass,   setShowPass]       = useState(false);
  const [copyFailed, setCopyFailed]     = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);

  async function copy(text: string, which: 'link' | 'pass') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can fail on non-HTTPS origins or when permission is denied —
      // tell the user to copy manually instead of failing silently.
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 4000);
      return;
    }
    if (which === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2500);
    }
  }

  async function shareViaSystem() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my Converge meetup', url: sessionUrl });
      } catch {
        // user cancelled — do nothing
      }
    } else {
      copy(sessionUrl, 'link');
    }
  }

  function shareViaWhatsApp() {
    const msg = encodeURIComponent(`Join my Converge meetup → ${sessionUrl}`);
    // QUAL-03: Add noopener,noreferrer to prevent opener access.
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
  }

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* A11Y-05: dialog role with aria-modal and aria-labelledby */}
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="share-modal-title" className="slide-up bg-[#1e293b] rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl flex-shrink-0">🔗</div>
          <div>
            <h2 id="share-modal-title" className="font-bold text-white">Invite people</h2>
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
          {hasNativeShare ? (
            <button
              onClick={shareViaSystem}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors"
            >
              Share ↗
            </button>
          ) : (
            <button
              onClick={shareViaWhatsApp}
              className="flex-1 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20c45a] text-white font-semibold text-sm transition-colors"
            >
              WhatsApp
            </button>
          )}
        </div>

        {copyFailed && (
          <p role="alert" className="text-amber-400 text-xs mb-3 text-center">
            Couldn't copy automatically — select the link above and copy it manually.
          </p>
        )}

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
              {/* A11Y-07: aria-label for password visibility toggle */}
              <button onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'Hide password' : 'Show password'} className="text-slate-500 hover:text-slate-300 text-sm">
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
