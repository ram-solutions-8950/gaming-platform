import React from 'react';
import type { LudoTokenStyle, LudoColor } from '../../types/ludo';
import { soundManager } from '../../services/soundManager';
import { X, Check } from 'lucide-react';

interface Props {
  currentStyle: LudoTokenStyle;
  onSelectStyle: (style: LudoTokenStyle) => void;
  onClose: () => void;
}

interface StyleOption {
  id: LudoTokenStyle;
  name: string;
  badge: string;
  badgeColor: string;
  description: string;
  icon: string;
}

const STYLES: StyleOption[] = [
  {
    id: 'ROYAL_CROWN',
    name: 'Royal Crown',
    badge: 'DEFAULT • POPULAR',
    badgeColor: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950',
    description: 'Imperial 3D golden crown atop a luminous crystal jewel orb with royal collar',
    icon: '👑',
  },
  {
    id: 'KNIGHT_HELM',
    name: 'Knight Helm',
    badge: 'WARRIOR',
    badgeColor: 'bg-gradient-to-r from-indigo-500 to-cyan-400 text-slate-950',
    description: 'Heroic medieval battle helm with glowing eye-visor & aerodynamic gold plume',
    icon: '⚔️',
  },
  {
    id: 'ARCADE_DIAMOND',
    name: 'Arcade Gem',
    badge: 'CYBER ARCADE',
    badgeColor: 'bg-gradient-to-r from-fuchsia-500 to-pink-400 text-white',
    description: 'Brilliant multi-faceted cut diamond gem with hovering neon orbital gyro',
    icon: '💎',
  },
];

const PREVIEW_COLORS: Array<{ color: LudoColor; label: string; grad: string }> = [
  { color: 'RED', label: 'Ruby', grad: 'from-red-500 to-rose-700' },
  { color: 'GREEN', label: 'Emerald', grad: 'from-emerald-400 to-teal-700' },
  { color: 'YELLOW', label: 'Topaz', grad: 'from-amber-400 to-yellow-600' },
  { color: 'BLUE', label: 'Sapphire', grad: 'from-blue-400 to-indigo-700' },
];

export const LudoTokenSelectorModal: React.FC<Props> = ({
  currentStyle,
  onSelectStyle,
  onClose,
}) => {
  const handleSelect = (style: LudoTokenStyle) => {
    soundManager.play('button_click');
    onSelectStyle(style);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-gradient-to-b from-[#150a2e] via-[#0d051f] to-[#060210] border-2 border-amber-500/50 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] text-white flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">✨</span>
            <div>
              <h3 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 uppercase tracking-wide">
                Choose Token Style
              </h3>
              <p className="text-[11px] text-slate-400">
                Personalize your pawns with custom 3D models & animations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer border border-slate-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Style Options */}
        <div className="flex flex-col gap-3">
          {STYLES.map((style) => {
            const isSelected = currentStyle === style.id;
            return (
              <div
                key={style.id}
                onClick={() => handleSelect(style.id)}
                className={`group relative flex flex-col gap-2 p-3 sm:p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80'
                }`}
              >
                {/* Title & Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl">{style.icon}</span>
                    <span className="font-black text-sm sm:text-base text-white tracking-wide">
                      {style.name}
                    </span>
                    <span
                      className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${style.badgeColor}`}
                    >
                      {style.badge}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 leading-tight">{style.description}</p>

                {/* 4-Color Preview Pills */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {PREVIEW_COLORS.map(({ color, label, grad }) => (
                    <div
                      key={color}
                      className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-slate-950/70 border border-white/5"
                    >
                      <div
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br ${grad} border-2 border-white/40 shadow-inner flex items-center justify-center text-[10px]`}
                      >
                        {style.icon}
                      </div>
                      <span className="text-[9px] font-bold text-slate-300">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-yellow-400 hover:to-amber-400 active:scale-98 text-slate-950 font-black text-xs sm:text-sm rounded-xl uppercase tracking-wider shadow-lg shadow-amber-500/20 border border-yellow-200/60 cursor-pointer transition"
        >
          Confirm Style
        </button>
      </div>
    </div>
  );
};
