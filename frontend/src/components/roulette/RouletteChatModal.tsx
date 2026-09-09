import React, { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  sender: string;
  vip?: string;
  text: string;
  time: string;
  isSelf?: boolean;
}

export interface RouletteChatModalProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClose: () => void;
}

const QUICK_REACTIONS = [
  '🍀 Good Luck everyone!',
  '🔴 Red is hot today!',
  '⚫ Black will hit next!',
  '🔥 High numbers (19-36)!',
  '🎯 Number 7 is coming!',
  '💰 Big bet placed!',
  '🎉 Wow what a spin!',
  '🚀 Let’s go!',
];

export const RouletteChatModal: React.FC<RouletteChatModalProps> = ({
  messages,
  onSendMessage,
  onClose,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  const handleQuickSend = (text: string) => {
    onSendMessage(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-md h-[88vh] max-h-[580px] flex flex-col rounded-2xl bg-gradient-to-b from-[#0a2f1d] via-[#041d12] to-[#02110a] border border-emerald-400/40 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-700/30 via-teal-900/40 to-emerald-700/30 border-b border-emerald-400/25">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">💬</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white">
                  Table Live Chat
                </h2>
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  193 Online
                </span>
              </div>
              <p className="text-[10px] text-gray-400">Share tips, celebrate wins & react in real-time</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-gray-300 hover:text-white transition-all text-sm font-bold cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Quick Reactions Scroll */}
        <div className="px-3 py-2 bg-black/40 border-b border-white/10 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
          {QUICK_REACTIONS.map((reaction, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleQuickSend(reaction)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-white/5 hover:bg-amber-400/20 active:scale-95 border border-white/15 hover:border-amber-400/40 text-[11px] font-bold text-amber-200 transition-all cursor-pointer whitespace-nowrap"
            >
              {reaction}
            </button>
          ))}
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5">
                <span className={`font-bold ${msg.isSelf ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {msg.sender}
                </span>
                {msg.vip && (
                  <span className="px-1 rounded bg-amber-400/20 text-amber-300 text-[8px] font-black border border-amber-400/30">
                    {msg.vip}
                  </span>
                )}
                <span>• {msg.time}</span>
              </div>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs font-medium ${
                  msg.isSelf
                    ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-black font-bold rounded-tr-none shadow-md'
                    : 'bg-white/10 text-white rounded-tl-none border border-white/10'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-3 bg-black/70 border-t border-white/10 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message or cheer..."
            maxLength={120}
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-amber-400/60 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-black text-xs font-black transition-all cursor-pointer shadow"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
