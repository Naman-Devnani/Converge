import { useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';

interface Props {
  sessionUrl: string;
  password?: string;
  onClose: () => void;
}

export default function ShareModal({ sessionUrl, password, onClose }: Props) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [passOpen,   setPassOpen]   = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);

  async function copy(text: string, which: 'link' | 'pass') {
    try { await navigator.clipboard.writeText(text); }
    catch { setCopyFailed(true); setTimeout(() => setCopyFailed(false), 4000); return; }
    if (which === 'link') { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500); }
    else { setCopiedPass(true); setTimeout(() => setCopiedPass(false), 2500); }
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my Converge meetup', url: sessionUrl }); } catch { /* cancelled */ }
    } else {
      const msg = encodeURIComponent(`Join my Converge meetup → ${sessionUrl}`);
      window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
    }
  }

  const display = sessionUrl.replace(/^https?:\/\//, '');

  return (
    <div className="fade-in fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-surface-dim/60 backdrop-blur-sm">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="share-modal-title"
        className="slide-up w-full max-w-lg bg-surface-container-low border-t sm:border border-white/10 rounded-t-[32px] sm:rounded-[32px] glow-shadow-emerald sm:mx-4 px-container-margin pb-xl pt-md flex flex-col items-center">

        <div className="w-12 h-1.5 bg-outline-variant rounded-full mb-lg opacity-40 sm:hidden" />

        <div className="w-full text-left mb-xl">
          <h1 id="share-modal-title" className="text-headline-lg-mobile text-on-surface mb-xs">Invite people</h1>
          <p className="text-body-md text-on-surface-variant">Anyone with this link can join</p>
        </div>

        {/* Link row */}
        <div className="w-full bg-surface-container-lowest rounded-xl p-md flex items-center justify-between border border-white/5 mb-lg gap-3">
          <span className="text-label-md text-secondary tracking-wide truncate">{display}</span>
          <span className="material-symbols-outlined text-on-surface-variant flex-shrink-0">link</span>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-md w-full mb-md">
          <button onClick={() => copy(sessionUrl, 'link')} className="flex items-center justify-center gap-sm h-14 rounded-full border-2 border-secondary/30 text-secondary text-label-md hover:bg-secondary/10 transition-all active:scale-95">
            <span className="material-symbols-outlined text-[20px]">{copiedLink ? 'check_circle' : 'content_copy'}</span>
            {copiedLink ? 'Copied!' : 'Copy link'}
          </button>
          <button onClick={share} className="flex items-center justify-center gap-sm h-14 rounded-full bg-gradient-to-r from-secondary-container to-secondary-fixed-dim text-on-secondary-container text-label-md glow-shadow-emerald hover:opacity-90 transition-all active:scale-95">
            <span className="material-symbols-outlined text-[20px]">share</span> Share
          </button>
        </div>

        {copyFailed && (
          <p role="alert" className="w-full text-error text-label-md mb-md text-center">Couldn't copy — select the link above and copy it manually.</p>
        )}

        {/* Password collapsible */}
        {password && (
          <div className="w-full border-t border-white/10 pt-lg mb-lg">
            <button onClick={() => setPassOpen(o => !o)} className="flex items-center justify-between w-full group">
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-secondary transition-colors">shield_lock</span>
                <span className="text-label-md text-on-surface">Session password</span>
              </div>
              <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${passOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            {passOpen && (
              <div className="pt-md">
                <div className="bg-surface-container-highest rounded-xl p-md flex items-center gap-md border border-white/5">
                  <span className="flex-1 text-label-md text-on-surface font-mono truncate">{showPass ? password : '••••••••••••'}</span>
                  <button onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'Hide password' : 'Show password'} className="text-on-surface-variant hover:text-secondary transition-colors">
                    <span className="material-symbols-outlined text-[20px]">{showPass ? 'visibility_off' : 'visibility'}</span>
                  </button>
                  <button onClick={() => copy(password, 'pass')} aria-label="Copy password" className="text-on-surface-variant hover:text-secondary transition-colors">
                    <span className="material-symbols-outlined text-[20px]">{copiedPass ? 'check_circle' : 'content_copy'}</span>
                  </button>
                </div>
                <p className="mt-sm text-[12px] text-error flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  Share the password separately — not in the same message as the link.
                </p>
              </div>
            )}
          </div>
        )}

        <button onClick={onClose} className="w-full h-16 rounded-2xl bg-surface-container-high text-on-surface text-headline-md hover:bg-surface-bright transition-all active:scale-95">Done</button>
      </div>
    </div>
  );
}
