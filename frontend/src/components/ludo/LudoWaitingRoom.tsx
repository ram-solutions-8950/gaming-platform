import React, { useState, useEffect } from 'react';
import { useLudo } from '../../contexts/LudoContext';
import { walletService } from '../../services/wallet';

function paiseToRupees(p: number): string {
  return (p / 100).toFixed(0);
}

const AVAILABLE_FEES = [1000, 5000, 10000];

function MiniBoard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-white/70 ${
      compact ? 'h-[48px] w-[48px] sm:h-[60px] sm:w-[60px]' : 'h-[64px] w-[64px] sm:h-[80px] sm:w-[80px]'
    }`}>
      <div className="grid h-full w-full grid-cols-3 grid-rows-3">
        <div className="bg-[#e53935]" />
        <div className="bg-white" />
        <div className="bg-[#43a047]" />
        <div className="bg-white" />
        <div className="relative bg-white">
          <div className="absolute inset-[18%] rotate-45 bg-gradient-to-br from-[#e53935] via-[#fdd835] to-[#1e88e5]" />
        </div>
        <div className="bg-white" />
        <div className="bg-[#1e88e5]" />
        <div className="bg-white" />
        <div className="bg-[#fdd835]" />
      </div>
      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
        <div className="m-[22%] rounded-full bg-white/90 shadow" />
        <div />
        <div className="m-[22%] rounded-full bg-white/90 shadow" />
        <div />
        <div />
        <div />
        <div className="m-[22%] rounded-full bg-white/90 shadow" />
        <div />
        <div className="m-[22%] rounded-full bg-white/90 shadow" />
      </div>
    </div>
  );
}

function TokenStack({ count }: { count: number }) {
  const colors = ['#e53935', '#43a047', '#1e88e5', '#fdd835'];
  return (
    <div className="flex items-end justify-center -space-x-1">
      {colors.slice(0, count).map((c) => (
        <span
          key={c}
          className="inline-block h-4 w-4 rounded-full border border-white shadow-sm sm:h-5 sm:w-5"
          style={{
            background: `radial-gradient(circle at 32% 28%, #fff 0%, ${c} 42%, #111 140%)`,
          }}
        />
      ))}
    </div>
  );
}

export const LudoWaitingRoom: React.FC = () => {
  const { match, matchmakingStatus, joinMatchmaking, cancelMatchmaking, connectionStatus, error, clearError } = useLudo();
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<number>(4);
  const [selectedFee, setSelectedFee] = useState<number>(1000);

  useEffect(() => {
    walletService.getWallet().then((w) => {
      setWalletLabel(w.balance_inr);
    }).catch(() => {});
  }, [match?.status, matchmakingStatus?.status]);

  if (match) {
    if (match.status !== 'WAITING') return null;

    return (
      <div className="mx-auto w-full max-w-sm px-2">
        <KingCard>
          <div className="text-center py-2">
            <p className="text-base font-black tracking-wide text-white sm:text-lg">Match starting…</p>
            <p className="mt-1 text-xs text-white/75">Connecting ({connectionStatus})</p>
            <div className="mx-auto mt-3 h-8 w-8 animate-spin rounded-full border-3 border-white/25 border-t-[#fdd835]" />
          </div>
        </KingCard>
      </div>
    );
  }

  const isIdle =
    !matchmakingStatus ||
    matchmakingStatus.status === 'NOT_QUEUED' ||
    matchmakingStatus.status === 'CANCELLED';

  const prizePaise = selectedFee * selectedPlayers;

  return (
    <div className="mx-auto flex w-full max-w-sm sm:max-w-md landscape:max-w-xl flex-col items-center justify-center px-2 select-none">
      {error && (
        <button
          type="button"
          onClick={clearError}
          className="mb-2 w-full rounded-xl bg-red-600 px-3 py-1.5 text-center text-xs font-semibold text-white shadow-lg flex items-center justify-between"
        >
          <span>{error}</span>
          <span className="text-white/80 font-bold ml-2">✕</span>
        </button>
      )}

      {isIdle ? (
        <KingCard>
          {/* Portrait layout (default) / Landscape 2-column layout */}
          <div className="flex flex-col landscape:flex-row landscape:items-stretch landscape:gap-4 w-full">
            {/* Left Column in Landscape / Top in Portrait */}
            <div className="flex flex-col justify-between landscape:w-5/12">
              <div className="flex items-center justify-between gap-2.5">
                <MiniBoard />
                <div className="min-w-0 flex-1 text-right sm:text-left">
                  <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#fdd835] sm:text-[10px]">
                    Classic Board
                  </p>
                  <h2 className="mt-0.5 flex flex-wrap justify-end gap-0.5 font-black leading-none sm:justify-start">
                    {['L', 'U', 'D', 'O'].map((letter, i) => (
                      <span
                        key={letter}
                        className="text-2xl sm:text-3xl drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]"
                        style={{ color: ['#e53935', '#43a047', '#1e88e5', '#fdd835'][i] }}
                      >
                        {letter}
                      </span>
                    ))}
                  </h2>
                  <p className="text-[10px] font-semibold text-white/80 sm:text-xs">
                    Real-time multiplayer
                  </p>
                </div>
              </div>

              {walletLabel !== null && (
                <div className="mt-2 landscape:mt-2 flex items-center justify-between rounded-full bg-black/25 px-2.5 py-0.5 ring-1 ring-white/15">
                  <span className="text-[10px] font-semibold text-white/70">Wallet</span>
                  <span className="text-xs font-black text-[#fdd835]">₹{walletLabel}</span>
                </div>
              )}

              <div className="mt-2 landscape:mt-2 flex items-center justify-between rounded-xl bg-black/20 px-2.5 py-1 text-[10px] sm:text-xs">
                <span className="font-semibold text-white/70">Prize pool</span>
                <span className="font-black text-[#fdd835]">₹{paiseToRupees(prizePaise)}</span>
              </div>
            </div>

            {/* Right Column in Landscape / Bottom in Portrait */}
            <div className="flex flex-col justify-between landscape:w-7/12 mt-2 landscape:mt-0">
              <div>
                <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-white/70">
                  Choose players
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  {[2, 4].map((num) => {
                    const active = selectedPlayers === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSelectedPlayers(num)}
                        className={`min-h-[46px] sm:min-h-[54px] rounded-xl px-1.5 py-1 transition active:scale-95 cursor-pointer ${
                          active
                            ? 'bg-white text-[#1b5e20] shadow-[0_3px_0_#1565c0] ring-2 ring-[#fdd835]'
                            : 'bg-black/20 text-white ring-1 ring-white/15 hover:bg-black/30'
                        }`}
                      >
                        <TokenStack count={num} />
                        <span className="mt-0.5 block text-xs font-black">{num} Players</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2">
                <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-white/70">
                  Entry fee
                </p>
                <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                  {AVAILABLE_FEES.map((fee) => {
                    const active = selectedFee === fee;
                    return (
                      <button
                        key={fee}
                        type="button"
                        onClick={() => setSelectedFee(fee)}
                        className={`min-h-[34px] sm:min-h-[38px] rounded-lg px-1 py-1 text-xs font-black transition active:scale-95 cursor-pointer ${
                          active
                            ? 'bg-[#fdd835] text-[#3e2723] shadow-[0_3px_0_#f9a825]'
                            : 'bg-black/25 text-white ring-1 ring-white/15 hover:bg-black/35'
                        }`}
                      >
                        ₹{paiseToRupees(fee)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => joinMatchmaking(selectedPlayers, selectedFee)}
                className="mt-2.5 min-h-[40px] sm:min-h-[46px] w-full rounded-xl bg-gradient-to-b from-[#7cb342] to-[#33691e] text-sm sm:text-base font-black uppercase tracking-widest text-white shadow-[0_4px_0_#1b5e20] transition active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                Play
              </button>
            </div>
          </div>
        </KingCard>
      ) : (
        <KingCard>
          {matchmakingStatus.status === 'SEARCHING' ? (
            <div className="text-center py-1 sm:py-2">
              <div className="relative mx-auto mb-2 h-11 w-11 sm:h-13 sm:w-13">
                <div className="absolute inset-0 animate-spin rounded-full border-3 border-white/20 border-t-[#fdd835]" />
                <div className="absolute inset-1.5 animate-pulse rounded-full bg-[#43a047]/40" />
              </div>
              <h3 className="text-sm sm:text-base font-black text-white">Finding players…</h3>
              <p className="mt-0.5 text-[10px] sm:text-xs text-white/70">
                {matchmakingStatus.player_count}P · ₹{paiseToRupees(matchmakingStatus.entry_fee)}
              </p>
              <div className="mt-2.5 overflow-hidden rounded-full bg-black/30 max-w-[200px] mx-auto">
                <div
                  className="h-1.5 sm:h-2 rounded-full bg-gradient-to-r from-[#fdd835] to-[#43a047] transition-all duration-500"
                  style={{
                    width: `${(matchmakingStatus.players_found / (matchmakingStatus.players_required || matchmakingStatus.player_count)) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] sm:text-xs font-bold text-[#fdd835]">
                {matchmakingStatus.players_found} / {matchmakingStatus.players_required || matchmakingStatus.player_count}
              </p>
              {matchmakingStatus.seconds_left !== undefined && (
                <p className="mt-1 text-[11px] sm:text-xs font-semibold text-white/80">
                  Time remaining: <span className="font-bold text-[#fdd835]">{matchmakingStatus.seconds_left}s</span>
                </p>
              )}
              <button
                type="button"
                onClick={() => cancelMatchmaking()}
                className="mt-2.5 min-h-[36px] px-6 rounded-xl bg-black/30 text-xs font-bold text-white ring-1 ring-white/20 hover:bg-red-700 active:scale-95 transition cursor-pointer"
              >
                Cancel search
              </button>
            </div>
          ) : (
            <div className="text-center py-2">
              <MiniBoard compact />
              <h3 className="mt-2 text-base font-black text-[#fdd835]">Match found!</h3>
              <p className="mt-0.5 text-[11px] text-white/80">Connecting to the board…</p>
              <div className="mx-auto mt-2.5 h-6 w-6 animate-spin rounded-full border-3 border-white/20 border-t-[#43a047]" />
            </div>
          )}
        </KingCard>
      )}
    </div>
  );
};

function KingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl sm:rounded-[24px] bg-[#2e7d32] p-[2px] sm:p-[3px] shadow-[0_12px_36px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
      <div className="rounded-[14px] sm:rounded-[21px] bg-gradient-to-b from-[#66bb6a] via-[#43a047] to-[#1b5e20] p-3 sm:p-4 md:p-5">
        {children}
      </div>
    </div>
  );
}
