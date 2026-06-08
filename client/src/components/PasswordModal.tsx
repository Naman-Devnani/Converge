import { useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';

interface Props {
  sessionName: string;
  error: string | null;
  onSubmit: (password: string) => void;
}

export default function PasswordModal({ sessionName, error, onSubmit }: Props) {
  const [value, setValue]     = useState('');
  const [visible, setVisible] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  return (
    <div className="fade-in fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="password-modal-title"
        className="slide-up w-full max-w-lg bg-surface rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 shadow-[0_-10px_60px_rgba(0,0,0,0.5)] sm:mx-4 overflow-hidden">

        <div className="flex justify-center pt-3 pb-2 sm:hidden"><span className="w-10 h-1 bg-surface-container-highest rounded-full" /></div>

        <div className="px-container-margin pb-10 pt-4 sm:pt-10 flex flex-col items-center text-center">
          {/* Lock badge */}
          <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mb-6 glow-shadow-emerald relative">
            <span className="material-symbols-outlined text-secondary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
            <div className="absolute inset-0 rounded-2xl border border-secondary/20 animate-pulse" />
          </div>

          <h2 id="password-modal-title" className="text-headline-lg-mobile text-on-surface mb-2">Password required</h2>
          <p className="text-body-md text-on-surface-variant px-4 mb-8">
            {sessionName
              ? <>This session <span className="text-on-surface font-bold">"{sessionName}"</span> is password protected.</>
              : 'This session is protected by a password. Enter it to join.'}
          </p>

          <div className="w-full space-y-6">
            <div className="relative w-full">
              <input
                autoFocus
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && value && onSubmit(value)}
                placeholder="Enter session password"
                className={`w-full h-14 bg-surface-container-lowest border-2 ${error ? 'border-error' : 'border-transparent'} focus:border-secondary rounded-2xl px-5 py-3 text-body-md text-on-surface placeholder:text-outline transition-all outline-none`}
              />
              <button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-secondary transition-colors">
                <span className="material-symbols-outlined">{visible ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>

            {error && <p className="text-error text-label-md -mt-3">{error}</p>}

            <button
              onClick={() => value && onSubmit(value)}
              disabled={!value}
              className="w-full h-14 bg-gradient-to-r from-secondary to-secondary-container text-on-secondary-container text-headline-md rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 glow-shadow-emerald disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            >
              <span>Join Session</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
