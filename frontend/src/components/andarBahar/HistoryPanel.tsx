import { cardLabel } from "../../game/andarBahar/deck";
import type { HistoryEntry } from "../../services/andarBahar";

export function HistoryPanel({ entries, onClose }: { entries: HistoryEntry[]; onClose?: () => void }) {
  return (
    <div className="history-sidebar">
      <div className="history-title-row">
        <span className="history-title">Server Round History</span>
        {onClose && <button className="history-close" onClick={onClose}>✕</button>}
      </div>
      {entries.length === 0 ? (
        <div className="history-empty">No rounds yet.</div>
      ) : (
        <div className="history-table">
          <div className="history-row history-head">
            <span>#</span>
            <span>Open Card</span>
            <span>Winner</span>
            <span>Cards</span>
            <span>Payout</span>
          </div>
          <div className="history-body">
            {entries.map((e, idx) => (
              <div key={e.id} className="history-row win">
                <span className="history-num">{entries.length - idx}</span>
                <span className="history-open">{cardLabel(e.openCard)}</span>
                <span className={`history-result ${e.winner}`}>
                  {e.winner === "andar" ? "Andar" : "Bahar"}
                </span>
                <span className="history-stake">{e.cardsDealt ? `${e.cardsDealt}` : "—"}</span>
                <span className="history-outcome">{e.winner === "andar" ? "0.9×" : "1.0×"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
