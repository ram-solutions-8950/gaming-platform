import React from 'react';

interface SideShowDialogProps {
  requesterName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const SideShowDialog: React.FC<SideShowDialogProps> = ({
  requesterName,
  onAccept,
  onDecline,
}) => {
  return (
    <div className="tp-modal-overlay">
      <div className="tp-modal-box">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d4af37', marginBottom: '0.5rem' }}>
          Side-Show Request!
        </h3>
        <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          <strong style={{ color: '#ffd700' }}>{requesterName}</strong> wants to compare cards with you privately.
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            className="tp-btn tp-btn-chaal"
            onClick={onAccept}
            style={{ minWidth: 110 }}
          >
            Accept
          </button>
          <button
            className="tp-btn tp-btn-pack"
            onClick={onDecline}
            style={{ minWidth: 110 }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};
