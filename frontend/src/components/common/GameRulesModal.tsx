import React from 'react';
import { X, BookOpen, CheckCircle, Trophy } from 'lucide-react';

export interface RuleSection {
  title: string;
  icon?: string;
  body: string | string[];
  badge?: string;
  example?: string;
  isPositive?: boolean;
}

export interface RulePayout {
  name: string;
  payout: string;
  desc?: string;
}

export interface GameRulesModalProps {
  title: string;
  subtitle?: string;
  sections: RuleSection[];
  payouts?: RulePayout[];
  tips?: string[];
  onClose: () => void;
}

export const GameRulesModal: React.FC<GameRulesModalProps> = ({
  title,
  subtitle,
  sections,
  payouts,
  tips,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[88dvh] bg-gradient-to-b from-[#18112e] via-[#100b21] to-[#0a0714] border border-amber-500/40 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.85)] text-white flex flex-col overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/30 to-amber-700/40 border border-amber-500/50 flex items-center justify-center text-amber-300">
              <BookOpen size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 uppercase tracking-wide">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium leading-tight">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer border border-white/10"
            aria-label="Close rules"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Rules Sections */}
          <div className="space-y-3">
            {sections.map((sec, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-200 text-xs sm:text-sm">
                    {sec.icon && <span>{sec.icon}</span>}
                    <span>{sec.title}</span>
                  </div>
                  {sec.badge && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      {sec.badge}
                    </span>
                  )}
                </div>

                {Array.isArray(sec.body) ? (
                  <ul className="space-y-1 pl-1 text-slate-300">
                    {sec.body.map((b, bi) => (
                      <li key={bi} className="flex items-start gap-1.5 leading-relaxed">
                        <span className="text-amber-400 text-xs mt-0.5">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-300 leading-relaxed">{sec.body}</p>
                )}

                {sec.example && (
                  <div
                    className={`mt-1.5 p-2 rounded-lg text-[11px] font-mono ${
                      sec.isPositive !== false
                        ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-200'
                        : 'bg-red-950/40 border border-red-500/30 text-red-200'
                    }`}
                  >
                    <span className="font-semibold">{sec.isPositive !== false ? '✓ ' : '✕ '}</span>
                    {sec.example}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Payouts Table (if provided) */}
          {payouts && payouts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <Trophy size={14} />
                <span>Payouts & Multipliers</span>
              </div>
              <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
                {payouts.map((p, pi) => (
                  <div key={pi} className="flex items-center justify-between p-2.5">
                    <div>
                      <span className="font-bold text-slate-200">{p.name}</span>
                      {p.desc && <p className="text-[10px] text-slate-400">{p.desc}</p>}
                    </div>
                    <span className="font-mono font-black text-amber-400 text-xs sm:text-sm">
                      {p.payout}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pro Tips / Hints (if provided) */}
          {tips && tips.length > 0 && (
            <div className="bg-gradient-to-br from-amber-950/30 to-amber-900/20 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <CheckCircle size={14} />
                <span>Strategy Hints</span>
              </div>
              <ul className="space-y-1 text-slate-300 text-[11px]">
                {tips.map((t, ti) => (
                  <li key={ti} className="flex items-start gap-1.5">
                    <span className="text-amber-400">💡</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white/5 border-t border-white/10 flex justify-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-md cursor-pointer"
          >
            Understood • Back to Game
          </button>
        </div>
      </div>
    </div>
  );
};
