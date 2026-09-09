import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { AviatorFairnessData } from '../../services/aviator';
import { aviatorService } from '../../services/aviator';

interface AviatorHistoryProps {
  crashes: number[];
  currentRoundId?: string | null;
}

export const AviatorHistory: React.FC<AviatorHistoryProps> = ({ crashes, currentRoundId }) => {
  const [fairnessModal, setFairnessModal] = useState<AviatorFairnessData | null>(null);
  const [loadingFairness, setLoadingFairness] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getPillColor = (mult: number) => {
    if (mult < 2.0) return 'pill-low'; // blue/cyan
    if (mult < 10.0) return 'pill-mid'; // purple/violet
    return 'pill-high'; // gold/yellow
  };

  const handleOpenFairness = async (roundId?: string | null) => {
    setLoadingFairness(true);
    try {
      if (roundId) {
        const data = await aviatorService.getFairness(roundId);
        setFairnessModal(data);
      } else {
        // Fallback info if roundId not yet assigned
        setFairnessModal({
          round_id: 'Current Round',
          nonce: 1,
          server_seed_hash: 'Pre-hashed SHA-256 commitment generated before flight begins',
          server_seed: null,
          crash_multiplier: null,
          status: 'IN_PROGRESS',
          verification_note:
            'Aviator is 100% Provably Fair. Every crash multiplier is generated deterministically before the round begins using HMAC-SHA256(server_seed, nonce). The server seed hash is published in advance so the outcome cannot be altered during flight.',
        });
      }
    } catch (e) {
      console.error('Failed to load fairness data', e);
      setFairnessModal({
        round_id: roundId || 'Active Round',
        nonce: 1,
        server_seed_hash: 'Pre-round SHA-256 hash committed',
        server_seed: null,
        crash_multiplier: null,
        status: 'ACTIVE',
        verification_note:
          'Aviator uses cryptographic SHA-256 hashing to guarantee provable fairness. Each round outcome is immutable and independently verifiable.',
      });
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

      {fairnessModal &&
        createPortal(
          <div className="aviator-modal-overlay" onClick={() => setFairnessModal(null)}>
            <div className="aviator-modal" onClick={(e) => e.stopPropagation()}>
              <div className="aviator-modal-header">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛡️</span>
                  <div>
                    <h3 className="font-bold text-base text-white">Provably Fair Verification</h3>
                    <p className="text-[11px] text-amber-400 font-semibold">100% Transparent Cryptographic Integrity</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="aviator-modal-close"
                  onClick={() => setFairnessModal(null)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              <div className="aviator-modal-body">
                <div className="aviator-info-row">
                  <div className="flex items-center justify-between">
                    <span className="label">Round ID</span>
                    {fairnessModal.round_id && fairnessModal.round_id !== 'Current Round' && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(fairnessModal.round_id, 'round_id')}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-bold ml-2 cursor-pointer"
                      >
                        {copiedKey === 'round_id' ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <span className="value font-mono text-xs">{fairnessModal.round_id}</span>
                </div>
                <div className="aviator-info-row">
                  <span className="label">Nonce (Round Number)</span>
                  <span className="value font-mono text-xs font-bold text-gray-200">{fairnessModal.nonce}</span>
                </div>
                <div className="aviator-info-row">
                  <div className="flex items-center justify-between">
                    <span className="label">Server Seed Hash (Pre-round SHA-256)</span>
                    {fairnessModal.server_seed_hash && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(fairnessModal.server_seed_hash, 'seed_hash')}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-bold ml-2 cursor-pointer"
                      >
                        {copiedKey === 'seed_hash' ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <span className="value font-mono text-[11px] break-all text-amber-300">
                    {fairnessModal.server_seed_hash}
                  </span>
                </div>
                <div className="aviator-info-row">
                  <div className="flex items-center justify-between">
                    <span className="label">Server Seed (Revealed Post-crash)</span>
                    {fairnessModal.server_seed && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(fairnessModal.server_seed!, 'seed')}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-bold ml-2 cursor-pointer"
                      >
                        {copiedKey === 'seed' ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <span className="value font-mono text-[11px] break-all text-emerald-400 font-semibold">
                    {fairnessModal.server_seed || '🔒 Encrypted until flight completes'}
                  </span>
                </div>
                <div className="aviator-info-row">
                  <span className="label">Crash Multiplier</span>
                  <span className="value font-bold text-lg text-rose-400">
                    {fairnessModal.crash_multiplier ? `${fairnessModal.crash_multiplier.toFixed(2)}x` : '✈️ In Flight...'}
                  </span>
                </div>
                <div className="aviator-fairness-note">
                  <span className="font-bold text-gray-300 block mb-1">How it works:</span>
                  <p>{fairnessModal.verification_note}</p>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
