import { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { socket } from '../socket';
import { useFocusTrap } from '../utils/useFocusTrap';

interface Props {
  messages: ChatMessage[];
  myId: string;
  onClose: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel({ messages, myId, onClose }: Props) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const trapRef   = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);
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
    <div className="fade-in fixed inset-0 z-[1500] flex flex-col justify-end bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Escape' || e.key === 'Enter') && onClose()} aria-label="Close chat" />

      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="chat-panel-title"
        className="relative slide-up bg-surface-container-lowest w-full h-[75%] rounded-t-3xl border-t border-white/10 shadow-[0_-20px_60px_rgba(132,43,210,0.15)] flex flex-col overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        <div className="w-full flex justify-center py-3"><span className="w-12 h-1.5 bg-outline-variant rounded-full opacity-30" /></div>

        {/* Header */}
        <header className="px-lg pb-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 id="chat-panel-title" className="text-headline-lg-mobile text-primary tracking-tight">Chat</h2>
            {messages.length > 0 && (
              <span className="px-3 py-1 bg-primary-container/20 text-primary border border-primary/20 rounded-full text-label-md">{messages.length}</span>
            )}
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-variant transition-colors active:scale-90">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-lg pb-lg space-y-lg min-h-0">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-on-surface-variant/40 text-[48px]">chat</span>
              <p className="text-on-surface-variant text-body-md mt-2">No messages yet.</p>
              <p className="text-on-surface-variant/60 text-label-md mt-1">Say hi to the group!</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.participantId === myId;
              return isMe ? (
                <div key={msg.id} className="flex flex-col items-end max-w-[85%] ml-auto">
                  <div className="bg-gradient-to-br from-secondary to-secondary-container px-md py-3 rounded-2xl rounded-tr-none text-on-secondary-container shadow-[0_4px_15px_rgba(78,222,163,0.3)]">
                    <p className="text-body-md font-semibold break-words">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-outline-variant mt-1 mr-2 uppercase tracking-widest">{formatTime(msg.timestamp)}</span>
                </div>
              ) : (
                <div key={msg.id} className="flex flex-col items-start max-w-[85%]">
                  <span className="text-label-md mb-1 ml-2" style={{ color: msg.color }}>{msg.participantName}</span>
                  <div className="bg-surface-container-high px-md py-3 rounded-2xl rounded-tl-none border border-white/5 text-on-surface shadow-md">
                    <p className="text-body-md break-words">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-outline-variant mt-1 ml-2 uppercase tracking-widest">{formatTime(msg.timestamp)}</span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-lg bg-surface-container-lowest/90 backdrop-blur-xl border-t border-white/5">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              maxLength={200}
              placeholder="Type a message…"
              className="flex-1 bg-surface-container px-md py-4 rounded-2xl border border-transparent focus:border-secondary text-on-surface placeholder:text-outline transition-all duration-300 outline-none text-body-md"
            />
            <button
              onClick={send}
              disabled={!text.trim()}
              className="w-14 h-14 bg-gradient-to-br from-secondary to-secondary-container text-on-secondary-container rounded-full flex items-center justify-center shadow-[0_8px_25px_rgba(0,165,114,0.3)] hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
