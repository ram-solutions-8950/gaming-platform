import React, { useState } from 'react';
import type { AviatorFairnessData } from '../../services/aviator';
import { aviatorService } from '../../services/aviator';

interface AviatorHistoryProps {
  crashes: number[];
  currentRoundId?: string | null;
}

export const AviatorHistory: React.FC<AviatorHistoryProps> = ({ crashes, currentRoundId }) => {
  const [fairnessModal, setFairnessModal] = useState<AviatorFairnessData | null>(null);
  const [loadingFairness, setLoadingFairness] = useState(false);

  const getPillColor = (mult: number) => {
    if (mult < 2.0) return 'pill-low'; // blue/cyan
    if (mult < 10.0) return 'pill-mid'; // purple/violet
    return 'pill-high'; // gold/yellow
  };

  const handleOpenFairness = async (roundId?: string | null) => {
    if (!roundId) return;
    setLoadingFairness(true);
    try {
      const data = await aviatorService.getFairness(roundId);
      setFairnessModal(data);
    } catch (e) {
      console.error('Failed to load fairness data', e);
    } finally {
      setLoadingFairness(false);
    }
  };

  return (
    <div className="aviator-history-bar">
      <div className="aviator-history-pills">
        {crashes.length === 0 ? (
          <div className="aviator-history-empty">Waiting for rounds...</div>
        ) : (
          crashes.map((val, idx) => (
            <div
              key={idx}
              className={`aviator-history-pill ${getPillColor(val)}`}
              onClick={() => handleOpenFairness(currentRoundId)}
              title="Click to view provably fair info"
            >
              {val.toFixed(2)}x
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        className="aviator-fairness-btn"
        disabled={loadingFairness}
        onClick={() => handleOpenFairness(currentRoundId)}
        title="Provably Fair Guarantee"
      >
        🛡️ <span className="hidden sm:inline">{loadingFairness ? 'Loading...' : 'Fairness'}</span>
      </button>

      {fairnessModal && (
        <div className="aviator-modal-overlay" onClick={() => setFairnessModal(null)}>
          <div className="aviator-modal" onClick={(e) => e.stopPropagation()}>
            <div className="aviator-modal-header">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <h3 className="font-bold text-lg text-white">Provably Fair Verification</h3>
              </div>
              <button
                className="aviator-modal-close"
                onClick={() => setFairnessModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="aviator-modal-body">
              <div className="aviator-info-row">
                <span className="label">Round ID</span>
                <span className="value font-mono text-xs">{fairnessModal.round_id}</span>
              </div>
              <div className="aviator-info-row">
                <span className="label">Nonce</span>
                <span className="value font-mono">{fairnessModal.nonce}</span>
              </div>
              <div className="aviator-info-row">
                <span className="label">Server Seed Hash (Pre-round SHA-256)</span>
                <span className="value font-mono text-xs break-all">{fairnessModal.server_seed_hash}</span>
              </div>
              <div className="aviator-info-row">
                <span className="label">Server Seed (Revealed Post-crash)</span>
                <span className="value font-mono text-xs break-all">
                  {fairnessModal.server_seed || 'Hidden until round completes'}
                </span>
              </div>
              <div className="aviator-info-row">
                <span className="label">Crash Multiplier</span>
                <span className="value font-bold text-brand-400">
                  {fairnessModal.crash_multiplier ? `${fairnessModal.crash_multiplier.toFixed(2)}x` : 'In Progress'}
                </span>
              </div>
              <div className="aviator-fairness-note">
                <p>{fairnessModal.verification_note}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
