import { useEffect, useState } from "react";
import { getServerUrl, setServerUrl, pingServer } from "../../services/andarBahar";

export function Settings({ onBack }: { onBack: () => void }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"unknown" | "ok" | "fail">("unknown");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUrl(getServerUrl());
  }, []);

  async function save() {
    setSaving(true);
    setServerUrl(url);
    if (url.trim()) {
      setStatus((await pingServer(url)) ? "ok" : "fail");
    } else {
      setStatus("unknown");
    }
    setSaving(false);
  }

  return (
    <div className="settings">
      <div className="topbar" style={{ padding: 0 }}>
        <span className="brand" style={{ fontSize: 18 }}>Settings</span>
        <button className="iconbtn" onClick={onBack}>✕</button>
      </div>

      <div className="field">
        <label>Server URL (for online / real-money play)</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-backend.com  (leave empty for offline provably fair)"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      <div className="row" style={{ alignItems: "center" }}>
        <button className="action" onClick={save} disabled={saving} style={{ flex: 1 }}>
          {saving ? "Saving…" : "Save & test"}
        </button>
        {status === "ok" && <span className="badge on">● connected</span>}
        {status === "fail" && <span className="badge off">● unreachable</span>}
      </div>

      <p className="hint">
        Offline (empty URL): play with virtual chips using a provably-fair shuffle.
        <br />
        With a server URL: bets go to your backend, which shuffles, decides the winner and
        settles your real wallet.
      </p>
    </div>
  );
}
