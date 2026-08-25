import { useEffect, useState } from "react";
import {
  findOrCreateTable,
  getRealBalance,
  getVirtualBalance,
  listTables,
  type TableOut,
} from "../../services/andarBahar";

type Mode = "virtual" | "real";

interface Tier {
  minBet: number;
  maxBet: number;
  minEntry: number;
}

const TIERS: Tier[] = [
  { minBet: 1, maxBet: 512, minEntry: 100 },
  { minBet: 5, maxBet: 2560, minEntry: 500 },
  { minBet: 20, maxBet: 10240, minEntry: 2000 },
  { minBet: 50, maxBet: 25600, minEntry: 5000 },
];
const BETTING_SECONDS = 15;

function fmt(mode: Mode, v: number): string {
  return mode === "virtual" ? `${v} chips` : `₹${v}`;
}

export function Lobby({
  serverUrl,
  onJoin,
  onBack,
}: {
  serverUrl: string;
  onJoin: (tableId: string, tier: Tier, mode: Mode) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<Mode>("virtual");
  const [balance, setBalance] = useState<number>(0);
  const [tables, setTables] = useState<TableOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningTier, setJoiningTier] = useState<number | null>(null);

  async function refresh() {
    try {
      const [b, t] = await Promise.all([
        mode === "virtual" ? Promise.resolve(getVirtualBalance()) : getRealBalance(),
        listTables(serverUrl),
      ]);
      setBalance(b);
      setTables(t);
    } catch {
      setError("Could not refresh tables.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, mode]);

  const onlineForMode = tables.filter((t) => t.mode === mode).reduce((sum, t) => sum + t.online_players, 0);

  async function playNow(tier: Tier, idx: number) {
    setJoiningTier(idx);
    setError(null);
    try {
      const table = await findOrCreateTable(serverUrl, mode, BETTING_SECONDS);
      onJoin(table.id, tier, mode);
    } catch {
      setError("Could not join a table right now — playing locally.");
      onJoin("local_table", tier, mode);
    } finally {
      setJoiningTier(null);
    }
  }

  return (
    <div className="lobby">
      <div className="lobby-top">
        <button className="iconbtn" onClick={onBack}>←</button>
        <span className="brand" style={{ fontSize: 18 }}>Andar Bahar Tables</span>
        <span className="balance"><small>{mode === "virtual" ? "♠" : "₹"}</small> {balance}</span>
      </div>

      <div className="lobby-tabs">
        <button className={`lobby-tab${mode === "virtual" ? " active" : ""}`} onClick={() => setMode("virtual")}>
          Practice (Virtual)
        </button>
        <button className={`lobby-tab${mode === "real" ? " active" : ""}`} onClick={() => setMode("real")}>
          Points (Real)
        </button>
      </div>

      {error && <p className="hint" style={{ color: "#ff9a8a" }}>{error}</p>}
      {loading ? (
        <p className="hint">Loading tables…</p>
      ) : (
        <div className="lobby-table">
          <div className="lobby-row lobby-head">
            <span>Min Bet</span><span>Max Bet</span><span>Min Entry</span><span>Online</span><span></span>
          </div>
          {TIERS.map((tier, idx) => {
            const canAfford = balance >= tier.minEntry;
            return (
              <div className="lobby-row" key={idx}>
                <span>{fmt(mode, tier.minBet)}</span>
                <span>{fmt(mode, tier.maxBet)}</span>
                <span>{fmt(mode, tier.minEntry)}</span>
                <span>{onlineForMode}</span>
                {mode === "virtual" || canAfford ? (
                  <button className="action" disabled={joiningTier === idx} onClick={() => playNow(tier, idx)}>
                    {joiningTier === idx ? "Joining…" : "Play Now"}
                  </button>
                ) : (
                  <button className="action secondary" onClick={() => window.location.href = '/deposit'}>Add Cash</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { Tier, Mode };
