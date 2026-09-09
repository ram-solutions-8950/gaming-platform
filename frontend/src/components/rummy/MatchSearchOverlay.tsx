import { useEffect, useState } from "react";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  status: "searching" | "matched" | "no_opponent" | "error";
  elapsedSeconds: number;
  solo: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onTryAgain: () => void;
  onBackToLobby: () => void;
  onCountdownDone: () => void;
}

/** Full-screen matchmaking overlay: searching → match-found countdown → (or)
 * no-opponent dead end. Purely presentational — `useMatchmaking` drives the state. */
export default function MatchSearchOverlay({
  status, elapsedSeconds, solo, errorMessage, onCancel, onTryAgain, onBackToLobby, onCountdownDone,
}: Props) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (status !== "matched") return;
    if (countdown <= 0) {
      onCountdownDone();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, countdown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-fade-in">
      <div className="w-full max-w-sm bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/60 rounded-3xl p-6 sm:p-8 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)] text-white">
        {status === "searching" && (
          <>
            <h2 className="font-display text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 uppercase tracking-wide mb-1">
              Indian Rummy
            </h2>
            <p className="text-slate-300 text-sm mb-5">Finding Opponent…</p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
              <span className="font-mono text-3xl font-bold text-slate-100">{fmt(elapsedSeconds)}</span>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Looking for a player with the same table settings…
            </p>
            <button
              type="button"
              className="py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer w-full"
              onClick={onCancel}
            >
              Cancel Match
            </button>
          </>
        )}

        {status === "matched" && (
          <>
            <h2 className="font-display text-xl font-black text-emerald-400 mb-2 uppercase tracking-wide">
              {solo ? "Table Ready" : "Match Found! 🎉"}
            </h2>
            {!solo && <p className="text-slate-300 mb-2 text-sm">Opponent found — get ready</p>}
            {solo && (
              <p className="text-slate-300 mb-2 text-sm">
                No opponent turned up in time — starting a practice table instead.
              </p>
            )}
            <div className="font-display text-5xl font-black text-amber-400 my-6">
              {countdown > 0 ? countdown : "GO"}
            </div>
          </>
        )}

        {status === "no_opponent" && (
          <>
            <h2 className="font-display text-xl font-black text-red-400 mb-2 uppercase tracking-wide">No Opponent Found</h2>
            <p className="text-slate-400 text-xs mb-6">
              Nobody with the same entry amount was searching. Your entry fee was never
              charged — nothing to refund.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-200 border border-slate-700 transition flex-1 cursor-pointer"
                onClick={onBackToLobby}
              >
                Back to Lobby
              </button>
              <button
                type="button"
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-xs shadow-md transition active:scale-95 flex-1 cursor-pointer uppercase tracking-wider"
                onClick={onTryAgain}
              >
                Try Again
              </button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <h2 className="font-display text-xl font-black text-red-400 mb-2 uppercase tracking-wide">Couldn't Search</h2>
            <p className="text-slate-400 text-xs mb-6">{errorMessage ?? "Something went wrong."}</p>
            <button
              type="button"
              className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-xs shadow-md transition active:scale-95 w-full cursor-pointer uppercase tracking-wider"
              onClick={onBackToLobby}
            >
              Back to Lobby
            </button>
          </>
        )}
      </div>
    </div>
  );
}
