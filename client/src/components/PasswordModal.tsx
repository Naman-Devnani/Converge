import { useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';

interface Props {
  sessionName: string;
  error: string | null;
  onSubmit: (password: string) => void;
}

export default function PasswordModal({ sessionName, error, onSubmit }: Props) {
  const [value, setValue]       = useState('');
  const [visible, setVisible]   = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* A11Y-05: dialog role with aria-modal and aria-labelledby */}
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="password-modal-title" className="slide-up bg-[#1e293b] rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl">
            🔒
          </div>
          <h2 id="password-modal-title" className="text-xl font-bold text-white">Password required</h2>
          <p className="text-slate-400 text-sm mt-1.5">
            {sessionName
              ? <>This session <span className="text-white font-medium">"{sessionName}"</span> is password protected.</>
              : 'This session is password protected.'}
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Enter password
          </label>
          <div className="relative">
            <input
              autoFocus
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && value && onSubmit(value)}
              placeholder="Session password…"
              className={`w-full bg-[#0f172a] border ${error ? 'border-red-500' : 'border-slate-700'} focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-white placeholder-slate-600 pr-10 transition-colors`}
            />
            {/* A11Y-07: aria-label for password visibility toggle */}
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {visible ? '🙈' : '👁'}
            </button>
          </div>
          {error && (
            <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
              <span>✕</span> {error}
            </p>
          )}
        </div>

        <button
          onClick={() => value && onSubmit(value)}
          disabled={!value}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-white font-bold text-base shadow-lg shadow-emerald-500/20 transition-all"
        >
          Join Session
        </button>
      </div>
    </div>
  );
}
