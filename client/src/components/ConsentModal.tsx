import { useState } from 'react';
import { randomName } from '../utils/geo';

interface Props {
  isNewSession: boolean;
  onConsent: (name: string, approxMode: boolean) => void;
}

export default function ConsentModal({ isNewSession, onConsent }: Props) {
  const [name, setName]           = useState(randomName);
  const [approxMode, setApproxMode] = useState(false);

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="slide-up bg-[#1e293b] rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl">
            {isNewSession ? '🚀' : '📍'}
          </div>
          <h2 className="text-xl font-bold text-white">
            {isNewSession ? 'Start your meetup' : 'Join this meetup'}
          </h2>
          <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
            {isNewSession
              ? 'Share the link that appears after joining.'
              : 'Someone shared this link with you. Join to see each other on the map.'}
          </p>
        </div>

        {/* Name input */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Your display name
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && name.trim() && onConsent(name.trim(), approxMode)}
            maxLength={32}
            placeholder="How should others see you?"
            className="w-full bg-[#0f172a] border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-white placeholder-slate-600 transition-colors"
          />
          <p className="text-xs text-slate-600 mt-1.5">Random name generated — change it if you like.</p>
        </div>

        {/* Approximate location toggle */}
        <div className="flex items-center justify-between bg-[#0f172a] rounded-xl px-4 py-3 mb-5 border border-slate-700/50">
          <div>
            <p className="text-white text-sm font-medium">Approximate location</p>
            <p className="text-slate-500 text-xs mt-0.5">±500 m privacy blur — less precise</p>
          </div>
          <button
            type="button"
            onClick={() => setApproxMode(v => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ml-3 ${
              approxMode ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
            aria-label="Toggle approximate location"
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                approxMode ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Privacy bullets */}
        <ul className="space-y-2 mb-6">
          {[
            'Location shared only while this tab is open',
            'Visible only to people with this link',
            'No data stored after the session ends',
            'Revoke anytime by closing the tab',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-400">
              <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>
              {item}
            </li>
          ))}
        </ul>

        <button
          onClick={() => onConsent(name.trim() || randomName(), approxMode)}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold text-base shadow-lg shadow-emerald-500/20 transition-all"
        >
          Share My Location & Join
        </button>
        <p className="text-center text-xs text-slate-600 mt-3">
          Your browser will ask for location permission.
        </p>
      </div>
    </div>
  );
}
