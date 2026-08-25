import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import * as api from "./services/api";
import { ensureAuth, lastAuthError } from "./services/auth";
import { getClientSeed, getServerUrl, nextNonce } from "./services/config";
import { haptics } from "./services/haptics";
import { soundManager } from "./services/soundManager";
import { REEL_STOPS_MS, REVEAL_BUFFER_MS, spinPace } from "./services/spinTiming";
import { History } from "./screens/History";
import { Lobby } from "./screens/Lobby";
import { ModeSelect } from "./screens/ModeSelect";
import { Paytable } from "./screens/Paytable";
import { Settings } from "./screens/Settings";

type Screen = "boot" | "mode" | "lobby" | "history" | "settings" | "paytable";
type GameMode = "virtual" | "real";

export interface SpinOutcome {
  result: api.SpinResponse;
  stake: number;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [serverUrl, setServerUrl] = useState("");
  const [wallet, setWallet] = useState<api.Wallet | null>(null);
  const [mode, setMode] = useState<GameMode>("virtual");
  const [config, setConfig] = useState<api.Triple777Config | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  const [spinning, setSpinning] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<SpinOutcome | null>(null);
  const [spinReels, setSpinReels] = useState<[string, string, string] | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const [spinPaceValue, setSpinPaceValue] = useState<ReturnType<typeof spinPace>>("normal");
  const [jackpot, setJackpot] = useState<number | null>(null);

  const [history, setHistory] = useState<api.HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Android hardware/gesture back button: on a sub-screen it should go back
  // to the Lobby (the app's only "home"), same as the on-screen back arrows;
  // on the Lobby itself there's nowhere further back to go, so it exits —
  // standard Android behavior for a root screen. A ref (not the `screen`
  // state directly) keeps this listener registered exactly once while still
  // always reading the current screen.
  const screenRef = useRef<Screen>("boot");
  useEffect(() => { screenRef.current = screen; }, [screen]);
  // Tracked alongside screenRef so the back-button handler (below) can
  // ignore presses mid-spin — see goToModeSelect's comment for why leaving
  // the Lobby before a spin's delayed reveal fires would resurrect the
  // stale-popup bug through a different path.
  const spinningRef = useRef(false);
  useEffect(() => { spinningRef.current = spinning; }, [spinning]);

  // Leaving the Lobby back to mode-select must clear all per-spin state —
  // otherwise re-entering the Lobby (which remounts it, resetting its own
  // "already shown this result" ref) sees the *previous* session's stale
  // lastOutcome as "new" and immediately replays its WIN/LOSS popup, or
  // shows a leftover error banner from a spin attempt several minutes ago.
  function goToModeSelect() {
    setLastOutcome(null);
    setSpinReels(null);
    setSpinError(null);
    setScreen("mode");
  }

  // Same remount-reset problem as goToModeSelect, but for History/Paytable/
  // Settings: Lobby unmounts while those are open and remounts on return,
  // which would otherwise replay an already-seen WIN/LOSS popup or a stale
  // error banner. Reels stay as-is (spinReels not cleared) — a paytable/
  // history peek isn't "leaving the game," so the last landed symbols
  // should still be showing when the player comes back.
  function returnToLobby() {
    setLastOutcome(null);
    setSpinError(null);
    setScreen("lobby");
  }

  useEffect(() => {
    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      const s = screenRef.current;
      if (s === "lobby" && spinningRef.current) return; // ignore mid-spin
      if (s === "boot" || s === "mode") {
        void CapacitorApp.exitApp();
      } else if (s === "lobby") {
        goToModeSelect();
      } else {
        returnToLobby();
      }
    });
    return () => { void listenerPromise.then((h) => h.remove()); };
  }, []);

  const bootedRef = useRef(false);
  useEffect(() => {
    // Guards against React StrictMode's dev-only double-invoke of effects on
    // mount — a no-op in production builds.
    if (bootedRef.current) return;
    bootedRef.current = true;
    void soundManager.init();
    (async () => {
      const url = await getServerUrl();
      setServerUrl(url);
      const ok = await ensureAuth(url);
      if (!ok) {
        setBootError(lastAuthError ?? "Could not connect to the server.");
        setScreen("mode");
        return;
      }
      try {
        // No automatic welcome grant — a new player's balance starts at
        // exactly 0 (per the approved wallet-rules spec) until they
        // explicitly tap "Add Demo Credits".
        const [w, cfg, jackpotAmount] = await Promise.all([
          api.getWallet(url), api.getConfig(url), api.getJackpot(url),
        ]);
        setWallet(w);
        setConfig(cfg);
        setJackpot(jackpotAmount);
        setScreen("mode");
      } catch {
        setBootError("Could not load the game — check your connection and try again.");
        setScreen("mode");
      }
    })();
  }, []);

  async function refreshBalance() {
    const w = await api.getWallet(serverUrl);
    if (w) setWallet(w);
  }

  // Synchronous lock closing the tiny window between a tap and React
  // re-rendering the SPIN button as disabled — "one request = one bet = one
  // result" per the approved wallet-rules spec, so a double-tap can never
  // fire two in-flight spin requests even for an instant.
  const spinLockRef = useRef(false);

  async function handleSpin(stake: number, turbo: boolean) {
    if (spinLockRef.current) return;
    spinLockRef.current = true;
    setSpinning(true);
    setSpinError(null);
    setLastOutcome(null);
    haptics.spin();
    soundManager.play("reel_spin");
    try {
      const clientSeed = await getClientSeed();
      const nonce = await nextNonce();
      const result = await api.spin(serverUrl, { stake, clientSeed, nonce, mode });
      // The server result is already known the instant this resolves — kick
      // off the reel animation immediately (not after any delay) so the
      // reels actually spin for their full duration; only the WIN/balance/
      // celebration reveal is paced to land just after the last reel stops.
      const isJackpot = result.tier === "jackpot";
      const pace = spinPace(turbo, isJackpot);
      setSpinReels(result.reels as [string, string, string]);
      setSpinPaceValue(pace);
      setSpinToken((t) => t + 1);
      const revealDelay = REEL_STOPS_MS[pace][2] + REVEAL_BUFFER_MS[pace];
      window.setTimeout(() => {
        setLastOutcome({ result, stake });
        setWallet((w) => (w ? { ...w, [mode === "virtual" ? "virtual_chips" : "real_paise"]: result.balance } : w));
        setJackpot(result.jackpot_amount);
        setSpinning(false);
        spinLockRef.current = false;
        haptics.reelStop();
        if (result.jackpot_won > 0) {
          soundManager.play("777_win");
          haptics.win();
        } else if (result.won) {
          soundManager.play(result.tier === "jackpot" ? "777_win" : "big_win");
          haptics.win();
        } else {
          soundManager.play("reel_stop");
        }
      }, revealDelay);
    } catch (err) {
      setSpinError(err instanceof Error ? err.message : "Could not spin — try again.");
      setSpinning(false);
      spinLockRef.current = false;
    }
  }

  async function openHistory() {
    setScreen("history");
    setHistoryLoading(true);
    setHistory(await api.getHistory(serverUrl));
    setHistoryLoading(false);
  }

  const offlineBanner = !online && (
    <div className="bg-red-600/90 px-4 py-1.5 text-center text-xs font-medium text-white">
      No internet connection — reconnecting…
    </div>
  );

  if (screen === "boot") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="animate-pop-in title-777 text-4xl">777</div>
        <p className="font-display text-lg font-semibold text-gold-400">Triple 777</p>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full w-1/2 animate-pulse bg-gold-500" />
        </div>
      </div>
    );
  }

  const balance = wallet === null ? null : mode === "virtual" ? wallet.virtual_chips : wallet.real_paise;

  return (
    <div className="min-h-screen">
      {offlineBanner}
      {bootError && screen === "mode" && (
        <div className="bg-red-600/90 px-4 py-2 text-center text-xs font-medium text-white">{bootError}</div>
      )}
      {screen === "mode" && (
        <ModeSelect
          virtualBalance={wallet?.virtual_chips ?? null}
          realBalance={wallet?.real_paise ?? null}
          onSelect={(m) => {
            setMode(m);
            setScreen("lobby");
          }}
        />
      )}
      {screen === "lobby" && (
        <Lobby
          balance={balance}
          config={config}
          spinning={spinning}
          error={spinError}
          serverUrl={serverUrl}
          lastOutcome={lastOutcome}
          spinReels={spinReels}
          spinToken={spinToken}
          pace={spinPaceValue}
          jackpot={jackpot}
          mode={mode}
          onSpin={handleSpin}
          onOpenHistory={openHistory}
          onOpenSettings={() => setScreen("settings")}
          onOpenPaytable={() => setScreen("paytable")}
          onBalanceRefreshNeeded={refreshBalance}
          onChangeMode={goToModeSelect}
        />
      )}
      {screen === "history" && (
        <History items={history} loading={historyLoading} onBack={returnToLobby} />
      )}
      {screen === "paytable" && <Paytable config={config} onBack={returnToLobby} />}
      {screen === "settings" && <Settings onBack={returnToLobby} />}
    </div>
  );
}
