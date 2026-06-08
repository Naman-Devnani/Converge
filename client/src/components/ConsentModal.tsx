import { useState } from 'react';
import { randomName } from '../utils/geo';
import { useFocusTrap } from '../utils/useFocusTrap';

interface Props {
  isNewSession: boolean;
  onConsent: (name: string, approxMode: boolean) => void;
}

const BULLETS = [
  { icon: 'verified_user',        text: 'Location shared only while this tab is open' },
  { icon: 'link',                 text: 'Visible only to people with the link' },
  { icon: 'history_toggle_off',   text: 'No data stored after the session ends' },
  { icon: 'cancel_schedule_send', text: 'Revoke anytime by closing the tab' },
];

export default function ConsentModal({ isNewSession, onConsent }: Props) {
  const [name, setName]             = useState(randomName);
  const [approxMode, setApproxMode] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  return (
    <div className="fade-in fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="consent-modal-title"
        className="slide-up relative w-full max-w-lg bg-surface-container-low border-t sm:border border-white/10 rounded-t-[32px] sm:rounded-[32px] glow-shadow-emerald sm:mx-4">

        {/* mobile grabber */}
        <div className="flex justify-center py-4 sm:hidden"><span className="w-10 h-1 rounded-full bg-outline-variant/50" /></div>

        <div className="px-lg pb-xl pt-sm sm:pt-lg">
          {/* Header */}
          <div className="flex items-center gap-md mb-xl">
            <div className="w-12 h-12 rounded-2xl bg-secondary-container/20 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>{isNewSession ? 'rocket_launch' : 'location_on'}</span>
            </div>
            <div>
              <h1 id="consent-modal-title" className="text-headline-lg-mobile text-on-surface">{isNewSession ? 'Start your meetup' : 'Join this meetup'}</h1>
              <p className="text-label-md text-on-surface-variant uppercase tracking-widest">Privacy-first navigation</p>
            </div>
          </div>

          <div className="space-y-lg">
            {/* Display name */}
            <div className="space-y-sm">
              <label className="text-label-md text-secondary ml-1 block">Your display name</label>
              <div className="relative group">
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && name.trim() && onConsent(name.trim(), approxMode)}
                  maxLength={32}
                  className="w-full bg-surface-container-lowest border-2 border-transparent focus:border-secondary rounded-2xl py-md px-lg text-body-lg text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40"
                  placeholder="How should others see you?"
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 group-focus-within:text-secondary transition-colors">edit</span>
              </div>
            </div>

            {/* Approximate location toggle */}
            <div className="bg-surface-container-high/40 rounded-3xl p-lg flex items-center justify-between border border-white/5">
              <div className="flex-1 pr-md">
                <p className="text-headline-md text-on-surface">Approximate location</p>
                <p className="text-body-md text-on-surface-variant mt-1">±500 m privacy blur</p>
              </div>
              <button
                type="button" role="switch" aria-checked={approxMode} aria-label="Toggle approximate location"
                onClick={() => setApproxMode(v => !v)}
                className={`relative w-14 h-8 rounded-full transition-colors flex-shrink-0 ${approxMode ? 'bg-secondary' : 'bg-surface-container-highest'}`}
              >
                <span className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-on-surface transition-transform ${approxMode ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            {/* Privacy bullets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md py-sm">
              {BULLETS.map(b => (
                <div key={b.text} className="flex items-start gap-sm">
                  <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>{b.icon}</span>
                  <p className="text-body-md text-on-surface-variant">{b.text}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="pt-md text-center">
              <button
                onClick={() => onConsent(name.trim() || randomName(), approxMode)}
                className="w-full bg-gradient-to-r from-secondary-container to-secondary py-lg rounded-2xl text-headline-md text-on-secondary-container shadow-lg shadow-secondary/20 active:scale-95 transition-all duration-200 hover:brightness-110 flex items-center justify-center gap-sm"
              >
                <span>Share My Location &amp; Join</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
              <p className="text-label-md text-on-surface-variant mt-lg opacity-60">You'll see a standard browser location prompt next.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
