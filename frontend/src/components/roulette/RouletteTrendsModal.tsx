import React, { useMemo } from 'react';

export interface RouletteTrendsModalProps {
  history: Array<{ number: number; color: string }>;
  onClose: () => void;
}

const RED_NUMBERS_SET = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

export const RouletteTrendsModal: React.FC<RouletteTrendsModalProps> = ({
  history,
  onClose,
}) => {
  const stats = useMemo(() => {
    const total = history.length || 1;
    let redCount = 0;
    let blackCount = 0;
    let greenCount = 0;
    let evenCount = 0;
    let oddCount = 0;
    let lowCount = 0;
    let highCount = 0;
    let d1Count = 0;
    let d2Count = 0;
    let d3Count = 0;

    const frequencyMap: Record<number, number> = {};
    for (let i = 0; i <= 36; i++) {
      frequencyMap[i] = 0;
    }

    history.forEach((h) => {
      const num = h.number;
      frequencyMap[num] = (frequencyMap[num] || 0) + 1;

      if (num === 0) {
        greenCount++;
      } else {
        if (RED_NUMBERS_SET.has(num)) redCount++;
        else blackCount++;

        if (num % 2 === 0) evenCount++;
        else oddCount++;

        if (num <= 18) lowCount++;
        else highCount++;

        if (num <= 12) d1Count++;
        else if (num <= 24) d2Count++;
        else d3Count++;
      }
    });

    // Sort numbers by frequency
    const sortedNums = Object.entries(frequencyMap)
      .map(([n, count]) => ({ num: Number(n), count }))
      .sort((a, b) => b.count - a.count);

    const hotNumbers = sortedNums.slice(0, 5);
    const coldNumbers = sortedNums.slice(-5).reverse();

    return {
      total,
      redCount,
      blackCount,
      greenCount,
      redPct: Math.round((redCount / total) * 100),
      blackPct: Math.round((blackCount / total) * 100),
      greenPct: Math.round((greenCount / total) * 100),
      evenPct: Math.round((evenCount / Math.max(1, total - greenCount)) * 100),
      oddPct: Math.round((oddCount / Math.max(1, total - greenCount)) * 100),
      lowPct: Math.round((lowCount / Math.max(1, total - greenCount)) * 100),
      highPct: Math.round((highCount / Math.max(1, total - greenCount)) * 100),
      d1Pct: Math.round((d1Count / Math.max(1, total - greenCount)) * 100),
      d2Pct: Math.round((d2Count / Math.max(1, total - greenCount)) * 100),
      d3Pct: Math.round((d3Count / Math.max(1, total - greenCount)) * 100),
      hotNumbers,
      coldNumbers,
    };
  }, [history]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl bg-gradient-to-b from-[#0a2f1d] via-[#041d12] to-[#02110a] border border-emerald-400/40 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-emerald-600/30 via-teal-900/40 to-emerald-600/30 border-b border-emerald-400/25">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl drop-shadow">📈</span>
            <div>
              <h2 className="text-lg font-black tracking-wide bg-gradient-to-r from-emerald-200 via-teal-300 to-emerald-200 bg-clip-text text-transparent">
                Roulette Trends & Statistics
              </h2>
              <p className="text-[11px] text-emerald-200/70 font-medium">
                Live wheel analysis, hot & cold numbers, and sector percentages
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-gray-300 hover:text-white transition-all text-sm font-bold cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-h-[65vh]">
          {/* Recent History Track */}
          <div>
            <div className="text-xs font-bold text-gray-300 mb-2 flex items-center justify-between">
              <span>Recent Winning Numbers (Last {history.length} spins)</span>
              <span className="text-[10px] text-emerald-400">Live feed</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
              {history.slice(-16).map((item, idx, arr) => {
                const isLatest = idx === arr.length - 1;
                const bg =
                  item.number === 0
                    ? 'bg-emerald-600 border-emerald-400'
                    : RED_NUMBERS_SET.has(item.number)
                    ? 'bg-red-600 border-red-400'
                    : 'bg-slate-800 border-slate-600';

                return (
                  <div
                    key={idx}
                    className={`min-w-[28px] h-7 rounded-full flex items-center justify-center text-xs font-black border ${bg} text-white shadow ${
                      isLatest ? 'ring-2 ring-yellow-400 scale-110' : ''
                    }`}
                  >
                    {item.number}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hot & Cold Numbers */}
          <div className="grid grid-cols-2 gap-3">
            {/* Hot Numbers */}
            <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/30">
              <div className="flex items-center gap-1.5 text-xs font-black text-red-400 mb-2">
                <span>🔥 HOT NUMBERS</span>
              </div>
              <div className="flex items-center gap-1.5">
                {stats.hotNumbers.map((item) => (
                  <div
                    key={item.num}
                    className="flex-1 flex flex-col items-center p-1.5 rounded-lg bg-red-500/20 border border-red-500/30"
                  >
                    <span className="text-sm font-black text-red-200">{item.num}</span>
                    <span className="text-[9px] text-gray-400 font-bold">{item.count}x</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cold Numbers */}
            <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30">
              <div className="flex items-center gap-1.5 text-xs font-black text-cyan-400 mb-2">
                <span>❄️ COLD NUMBERS</span>
              </div>
              <div className="flex items-center gap-1.5">
                {stats.coldNumbers.map((item) => (
                  <div
                    key={item.num}
                    className="flex-1 flex flex-col items-center p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30"
                  >
                    <span className="text-sm font-black text-cyan-200">{item.num}</span>
                    <span className="text-[9px] text-gray-400 font-bold">{item.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Color Distribution Bar */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex justify-between text-xs font-bold text-gray-300">
              <span>Color Distribution</span>
              <span className="text-gray-400">
                Red: {stats.redPct}% • Black: {stats.blackPct}% • Green: {stats.greenPct}%
              </span>
            </div>
            <div className="h-3.5 w-full rounded-full overflow-hidden flex bg-black/40 border border-white/15">
              <div
                style={{ width: `${stats.redPct}%` }}
                className="bg-red-600 h-full flex items-center justify-center text-[9px] font-black text-white"
              >
                {stats.redPct > 15 && `${stats.redPct}%`}
              </div>
              <div
                style={{ width: `${stats.greenPct}%` }}
                className="bg-emerald-600 h-full flex items-center justify-center text-[8px] font-black text-white"
              >
                {stats.greenPct > 0 && `${stats.greenPct}%`}
              </div>
              <div
                style={{ width: `${stats.blackPct}%` }}
                className="bg-slate-800 h-full flex items-center justify-center text-[9px] font-black text-white"
              >
                {stats.blackPct > 15 && `${stats.blackPct}%`}
              </div>
            </div>
          </div>

          {/* Even / Odd & High / Low Bars */}
          <div className="grid grid-cols-2 gap-3">
            {/* Even vs Odd */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-300">
                <span>Even / Odd</span>
                <span className="text-yellow-400 text-[11px] font-extrabold">{stats.evenPct}% / {stats.oddPct}%</span>
              </div>
              <div className="h-3 w-full rounded-full overflow-hidden flex bg-black/40">
                <div style={{ width: `${stats.evenPct}%` }} className="bg-amber-500 h-full" />
                <div style={{ width: `${stats.oddPct}%` }} className="bg-indigo-500 h-full" />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-medium">
                <span>EVEN ({stats.evenPct}%)</span>
                <span>ODD ({stats.oddPct}%)</span>
              </div>
            </div>

            {/* Low vs High */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-300">
                <span>1-18 / 19-36</span>
                <span className="text-yellow-400 text-[11px] font-extrabold">{stats.lowPct}% / {stats.highPct}%</span>
              </div>
              <div className="h-3 w-full rounded-full overflow-hidden flex bg-black/40">
                <div style={{ width: `${stats.lowPct}%` }} className="bg-teal-500 h-full" />
                <div style={{ width: `${stats.highPct}%` }} className="bg-purple-500 h-full" />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-medium">
                <span>LOW 1-18 ({stats.lowPct}%)</span>
                <span>HIGH 19-36 ({stats.highPct}%)</span>
              </div>
            </div>
          </div>

          {/* Dozens Breakdown */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex justify-between text-xs font-bold text-gray-300">
              <span>Dozens Frequency</span>
              <span className="text-[11px] text-emerald-300 font-bold">1st / 2nd / 3rd 12</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-500/20">
                <div className="text-xs font-bold text-gray-300">1st 12</div>
                <div className="text-sm font-black text-emerald-400">{stats.d1Pct}%</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-500/20">
                <div className="text-xs font-bold text-gray-300">2nd 12</div>
                <div className="text-sm font-black text-emerald-400">{stats.d2Pct}%</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-500/20">
                <div className="text-xs font-bold text-gray-300">3rd 12</div>
                <div className="text-sm font-black text-emerald-400">{stats.d3Pct}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-black/60 border-t border-white/10 text-center">
          <p className="text-[11px] text-gray-400 font-medium">
            💡 Pro Tip: European Roulette has a single zero (0) giving an authentic 2.7% house edge.
          </p>
        </div>
      </div>
    </div>
  );
};
