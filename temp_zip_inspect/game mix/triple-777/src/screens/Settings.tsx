import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { getHapticsOn, getServerUrl, setHapticsOn, setServerUrl } from "../services/config";
import { soundManager } from "../services/soundManager";

export function Settings({ onBack }: { onBack: () => void }) {
  const [serverUrl, setServerUrlState] = useState("");
  const [soundOn, setSoundOnState] = useState(!soundManager.isMuted());
  const [hapticsOn, setHapticsOnState] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getServerUrl().then(setServerUrlState);
    getHapticsOn().then(setHapticsOnState);
  }, []);

  async function save() {
    await setServerUrl(serverUrl);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="flex min-h-full flex-col gap-5 p-5">
      <header className="flex items-center gap-3">
        <button className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-200 active:bg-ink-800" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="font-display text-xl font-bold text-gold-400">Settings</h1>
      </header>

      <div className="card-surface space-y-4 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Sound Effects</span>
          <button
            className={`h-7 w-12 rounded-full transition-colors ${soundOn ? "bg-gold-500" : "bg-ink-700"}`}
            onClick={() => {
              const next = !soundOn;
              setSoundOnState(next);
              void soundManager.setMuted(!next);
            }}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${soundOn ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Haptic Feedback</span>
          <button
            className={`h-7 w-12 rounded-full transition-colors ${hapticsOn ? "bg-gold-500" : "bg-ink-700"}`}
            onClick={() => {
              const next = !hapticsOn;
              setHapticsOnState(next);
              void setHapticsOn(next);
            }}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${hapticsOn ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>

      {/* Dev/debug only — a real player has no reason to see or edit this,
          and a wrong value here would just break the app for them. Present
          in `npm run dev` builds (used for testing), absent from the
          production build that actually ships as the APK. */}
      {import.meta.env.DEV && (
        <div className="card-surface space-y-3 p-4">
          <label className="block text-sm text-slate-300">Server URL (dev only)</label>
          <input
            className="input"
            value={serverUrl}
            onChange={(e) => setServerUrlState(e.target.value)}
            placeholder="https://deals-rummy-backend.onrender.com"
          />
          <button className="btn-gold w-full" onClick={save}>{saved ? "Saved ✓" : "Save"}</button>
          <p className="text-xs text-slate-500">
            Points the app at your backend. Leave the default unless you're running your own server.
            Changing this takes effect the next time you launch the app.
          </p>
        </div>
      )}

      <p className="text-center text-xs text-slate-600">DEMO CREDITS — no real money is used.</p>
    </div>
  );
}
