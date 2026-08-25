import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Coins, Gem, ListOrdered, History as HistoryIcon, Plus, Settings as SettingsIcon, Zap } from "lucide-react";
import type { SpinOutcome } from "../App";
import { AddDemoCreditsModal } from "../components/AddDemoCreditsModal";
import { AddMoneyModal } from "../components/AddMoneyModal";
import { InsufficientBalancePopup } from "../components/InsufficientBalancePopup";
import { ResultPopup, type ResultVariant } from "../components/ResultPopup";
import { SlotReels } from "../components/SlotReels";
import type { Triple777Config } from "../services/api";
import type { SpinPace } from "../services/spinTiming";

// Quick multipliers of the table minimum — matches the "1x 2x 5x 10x" row in
// the approved mockup (not absolute chip values).
const QUICK_MULTIPLIERS = [1, 2, 5, 10];
const AUTO_SPIN_COUNT = 10;

interface LobbyProps {
  balance: number | null;
  config: Triple777Config | null;
  spinning: boolean;
  error: string | null;
  serverUrl: string;
  lastOutcome: SpinOutcome | null;
  spinReels: [string, string, string] | null;
  spinToken: number;
  pace: SpinPace;
  jackpot: number | null;
  mode: "virtual" | "real";
  onSpin: (stake: number, turbo: boolean) => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onOpenPaytable: () => void;
  onBalanceRefreshNeeded: () => void;
  onChangeMode: () => void;
}

export function Lobby({
  balance, config, spinning, error, serverUrl, lastOutcome, spinReels, spinToken, pace, jackpot, mode,
  onSpin, onOpenHistory, onOpenSettings, onOpenPaytable, onBalanceRefreshNeeded, onChangeMode,
}: LobbyProps) {
  const [stake, setStake] = useState(50);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState<number | null>(null);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [showInsufficientPopup, setShowInsufficientPopup] = useState(false);
  const [insufficientFromAuto, setInsufficientFromAuto] = useState(false);
  const [showAddDemoCredits, setShowAddDemoCredits] = useState(false);

  useEffect(() => {
    if (config) setStake((s) => Math.max(config.min_bet, Math.min(config.max_bet, s)));
  }, [config]);

  const min = config?.min_bet ?? 10;
  const max = config?.max_bet ?? 10000;
  const balanceKnown = balance !== null;
  const affordable = balanceKnown && stake <= (balance as number);
  // Deliberately does NOT require affordability — SPIN/AUTO stay tappable
  // even when the bet can't be covered, so tapping them can show the
  // InsufficientBalancePopup instead of just doing nothing (a disabled
  // button swallows the click and explains nothing).
  const canSpin = !spinning && balanceKnown && stake >= min && stake <= max;
  const reels = spinReels ?? (["7", "BAR", "CHERRY"] as [string, string, string]);
  const symbols = config?.symbols ?? ["7", "BAR", "CHERRY", "LEMON", "BELL", "STAR", "COIN"];
  const lastWinAmount = lastOutcome?.result.won ? lastOutcome.result.payout + lastOutcome.result.jackpot_won : 0;
  const autoSpinning = autoSpinsLeft !== null;

  // A fresh spin result (new object identity) pops the WIN/LOSS notification
  // — auto-spin's next tap is chained off this popup's own onClose instead
  // of a fixed delay, so it never fires while the popup for the *previous*
  // spin is still on screen.
  const shownOutcomeRef = useRef<SpinOutcome | null>(null);
  useEffect(() => {
    if (lastOutcome && lastOutcome !== shownOutcomeRef.current) {
      shownOutcomeRef.current = lastOutcome;
      setShowResultPopup(true);
    }
  }, [lastOutcome]);

  function closeResultPopup() {
    setShowResultPopup(false);
    if (autoSpinsLeft !== null) {
      const stillAffordable = balance !== null && stake <= balance;
      if (autoSpinsLeft <= 1 || error) {
        setAutoSpinsLeft(null);
      } else if (!stillAffordable) {
        // "Never allow Auto Spin to create a negative balance" — stop and
        // explain why, same InsufficientBalancePopup but flagged so it can
        // say "Auto Spin stopped" instead of the tap-triggered wording.
        setAutoSpinsLeft(null);
        setInsufficientFromAuto(true);
        setShowInsufficientPopup(true);
      } else {
        setAutoSpinsLeft(autoSpinsLeft - 1);
        onSpin(stake, turbo);
      }
    }
  }

  function adjustStake(delta: number) {
    setStake((s) => Math.max(min, Math.min(max, s + delta)));
  }

  function handleSpinTap() {
    if (!affordable) {
      setInsufficientFromAuto(false);
      setShowInsufficientPopup(true);
      return;
    }
    onSpin(stake, turbo);
  }

  function toggleAuto() {
    if (autoSpinning) {
      setAutoSpinsLeft(null);
    } else if (!affordable) {
      setInsufficientFromAuto(false);
      setShowInsufficientPopup(true);
    } else if (canSpin) {
      setAutoSpinsLeft(AUTO_SPIN_COUNT);
      onSpin(stake, turbo);
    }
  }

  function handleAddCredits() {
    setShowInsufficientPopup(false);
    if (mode === "real") {
      setShowAddMoney(true);
    } else {
      setShowAddDemoCredits(true);
    }
  }

  let popupVariant: ResultVariant = "loss";
  let popupAmount = 0;
  if (lastOutcome) {
    const r = lastOutcome.result;
    const isBig = r.tier === "jackpot" || r.jackpot_won > 0;
    popupVariant = !r.won ? "loss" : isBig ? "bigwin" : "win";
    popupAmount = r.won ? r.payout + r.jackpot_won : lastOutcome.stake;
  }

  return (
    // Fixed 100dvh shell (not min-h-screen) — this app targets Android
    // phones only, so the whole game fits in one viewport with no page
    // scroll; dvh (not vh) accounts for the on-screen browser/nav chrome
    // shrinking the visible area. Bottom safe-area gets extra padding since
    // the PAYTABLE/HISTORY row sits right above a gesture nav bar.
    <div className="flex h-[100dvh] flex-col overflow-hidden px-4 pb-2 pt-3" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-1">
        <button
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-slate-200 active:bg-ink-800 disabled:opacity-40"
          disabled={spinning}
          onClick={onChangeMode}
          aria-label="Back to mode select"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="title-777 flex-1 text-center text-2xl leading-none tracking-wide">TRIPLE 777</h1>
        <button
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-slate-200 active:bg-ink-800"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          <SettingsIcon size={22} />
        </button>
      </header>

      <div className="shrink-0 py-1 text-center">
        <button
          className={`mx-auto inline-flex h-9 items-center gap-2 rounded-full border px-4 disabled:opacity-60 ${
            mode === "virtual" ? "border-gold-500/50 bg-gold-500/10" : "border-neon/50 bg-royal-900/40"
          }`}
          disabled={spinning}
          onClick={onChangeMode}
          aria-label="Change mode"
        >
          {mode === "virtual" ? <Coins size={14} className="text-gold-400" /> : <Gem size={14} className="text-neon" />}
          <span className={`font-display text-lg font-bold ${mode === "virtual" ? "text-gold-400" : "text-neon"} [text-shadow:0_0_16px_rgba(212,175,55,0.4)]`}>
            {balance === null ? "…" : balance.toLocaleString()}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-slate-400">
            {mode === "virtual" ? "Practice" : "Points"}
          </span>
        </button>
        <button
          className="mt-1 inline-flex h-8 items-center gap-1 rounded-full bg-gold-500/15 px-3 text-xs font-semibold text-gold-400 active:bg-gold-500/25"
          onClick={mode === "virtual" ? () => setShowAddDemoCredits(true) : () => setShowAddMoney(true)}
        >
          <Plus size={12} /> {mode === "virtual" ? "Add Credits" : "Add Money"}
        </button>
      </div>

      {jackpot !== null && (
        <div className="frame-gold mx-2 shrink-0 animate-glow-breathe px-3 py-1.5 text-center shadow-glow">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-neon">Jackpot</p>
          <p className="font-display text-2xl font-extrabold text-gold-300 [text-shadow:0_0_14px_rgba(212,175,55,0.6)]">
            {jackpot.toLocaleString()}
          </p>
        </div>
      )}

      {showAddMoney && (
        <AddMoneyModal serverUrl={serverUrl} onClose={() => setShowAddMoney(false)} onDeposited={onBalanceRefreshNeeded} />
      )}

      {showAddDemoCredits && (
        <AddDemoCreditsModal
          serverUrl={serverUrl}
          balance={balance ?? 0}
          onClose={() => setShowAddDemoCredits(false)}
          onTopUp={onBalanceRefreshNeeded}
        />
      )}

      {showInsufficientPopup && (
        <InsufficientBalancePopup
          variant={balance === 0 ? "empty" : "insufficient"}
          autoStopped={insufficientFromAuto}
          balance={balance ?? 0}
          bet={stake}
          addLabel={mode === "virtual" ? "ADD DEMO CREDITS" : "ADD MONEY"}
          onAdd={handleAddCredits}
          onCancel={() => setShowInsufficientPopup(false)}
        />
      )}

      {error && (
        <div className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
      )}

      <div className="flex flex-1 flex-col justify-center gap-3 overflow-hidden">
        <SlotReels symbols={symbols} reels={reels} spinToken={spinToken} pace={pace} />

        <div className="frame-gold mx-auto flex items-center gap-2 px-5 py-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Win</span>
          <span className={`font-display text-xl font-extrabold ${lastWinAmount > 0 ? "text-green-400" : "text-slate-500"}`}>
            {lastWinAmount.toLocaleString()}
          </span>
        </div>
      </div>

      {showResultPopup && lastOutcome && (
        <ResultPopup
          variant={popupVariant}
          amount={popupAmount}
          bet={lastOutcome.stake}
          multiplier={lastOutcome.result.multiplier}
          symbols={lastOutcome.result.reels as [string, string, string]}
          creditsLabel={mode === "virtual" ? "DEMO CREDITS" : "POINTS"}
          onClose={closeResultPopup}
        />
      )}

      <div className="shrink-0 space-y-2.5 pb-2">
        <div className="flex items-center justify-center gap-3">
          <button
            className="flex h-12 w-12 items-center justify-center rounded-lg border border-royal-500/50 bg-royal-900/30 text-xl font-bold text-slate-200 shadow-[inset_0_0_8px_rgba(139,0,255,0.13)] active:bg-royal-900/50 disabled:opacity-40"
            disabled={spinning || autoSpinning}
            onClick={() => adjustStake(-min)}
            aria-label="Decrease bet"
          >
            −
          </button>
          <div className="flex h-12 min-w-28 flex-col items-center justify-center rounded-lg border border-royal-500/40 bg-ink-950/60 px-4">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Bet</span>
            <span className="font-display text-lg font-bold text-slate-100">{stake}</span>
          </div>
          <button
            className="flex h-12 w-12 items-center justify-center rounded-lg border border-royal-500/50 bg-royal-900/30 text-xl font-bold text-slate-200 shadow-[inset_0_0_8px_rgba(139,0,255,0.13)] active:bg-royal-900/50 disabled:opacity-40"
            disabled={spinning || autoSpinning}
            onClick={() => adjustStake(min)}
            aria-label="Increase bet"
          >
            +
          </button>
        </div>

        <div className="flex items-stretch gap-2">
          <button
            className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] font-bold transition-colors ${
              turbo
                ? "border-gold-300 bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 shadow-glow"
                : "border-royal-500/50 bg-royal-900/30 text-gold-400 active:bg-royal-900/50"
            }`}
            onClick={() => setTurbo((t) => !t)}
            aria-pressed={turbo}
          >
            <Zap size={16} />
            TURBO
          </button>

          <button
            className="btn-spin h-14 flex-1 text-xl tracking-wide"
            disabled={spinning || autoSpinning || !canSpin}
            onClick={handleSpinTap}
          >
            {autoSpinning ? `AUTO ${autoSpinsLeft}` : spinning ? "SPINNING…" : "SPIN"}
          </button>

          <button
            className={`h-12 w-16 shrink-0 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-40 ${
              autoSpinning
                ? "border-red-400 bg-red-500 text-white"
                : "border-royal-500/50 bg-royal-900/30 text-gold-400 active:bg-royal-900/50"
            }`}
            disabled={!canSpin && !autoSpinning}
            onClick={toggleAuto}
          >
            {autoSpinning ? "STOP" : "AUTO"}
          </button>
        </div>

        <div className="flex items-center justify-center gap-2">
          {QUICK_MULTIPLIERS.map((m) => (
            <button
              key={m}
              disabled={spinning || autoSpinning}
              onClick={() => setStake(Math.min(max, min * m))}
              className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-40 ${
                stake === Math.min(max, min * m)
                  ? "border-white bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 shadow-glow"
                  : "border-royal-500/50 bg-royal-900/30 text-slate-300 active:bg-royal-900/50"
              }`}
            >
              {m}x
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-gold-600/50 text-sm font-semibold text-gold-300 active:bg-ink-800"
            onClick={onOpenPaytable}
          >
            <ListOrdered size={16} /> PAYTABLE
          </button>
          <button
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-gold-600/50 text-sm font-semibold text-gold-300 active:bg-ink-800"
            onClick={onOpenHistory}
          >
            <HistoryIcon size={16} /> HISTORY
          </button>
        </div>
      </div>
    </div>
  );
}
