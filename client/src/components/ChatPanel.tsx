import { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { socket } from '../socket';

interface Props {
  messages: ChatMessage[];
  myId: string;
  onClose: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel({ messages, myId, onClose }: Props) {
  const [text, setText]     = useState('');
  const bottomRef           = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // A11Y-03: Move focus to input when panel opens.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // A11Y-04: Close on Escape key globally.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('chat-message', { text: trimmed });
    setText('');
  }

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* A11Y-04: Backdrop with keyboard handler so Escape/Enter closes the panel */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Escape' || e.key === 'Enter') && onClose()}
        aria-label="Close chat"
      />

      {/* A11Y-05: dialog role with aria-modal and aria-labelledby */}
      {/* Panel — slides up from bottom, covers ~70% of screen */}
      <div role="dialog" aria-modal="true" aria-labelledby="chat-panel-title" className="relative mt-auto bg-[#1e293b] rounded-t-3xl flex flex-col shadow-2xl" style={{ maxHeight: '72vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">💬</span>
            <span id="chat-panel-title" className="font-bold text-white">Chat</span>
            {messages.length > 0 && (
              <span className="text-xs text-slate-500">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors">
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-slate-400 text-sm">No messages yet.</p>
              <p className="text-slate-500 text-xs mt-1">Say hi to the group!</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.participantId === myId;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <div className="flex items-center gap-1.5 mb-1 ml-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: msg.color }} />
                      <span className="text-xs font-semibold text-slate-400">{msg.participantName}</span>
                    </div>
                  )}
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                    isMe
                      ? 'bg-emerald-500 text-white rounded-br-sm'
                      : 'bg-[#0f172a] text-slate-100 rounded-bl-sm'
                  }`}>
                    <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-slate-600 mt-1 mx-1">{formatTime(msg.timestamp)}</span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-700/50 flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            maxLength={200}
            placeholder="Message…"
            className="flex-1 bg-[#0f172a] border border-slate-700 focus:border-emerald-500 outline-none rounded-xl px-4 py-2.5 text-white placeholder-slate-600 text-sm transition-colors"
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white font-bold transition-all active:scale-95"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
