import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TeenPattiLobby } from '../../components/teenPatti/TeenPattiLobby';
import { TeenPattiTable } from '../../components/teenPatti/TeenPattiTable';
import '../../styles/teen-patti.css';

export const TeenPatti: React.FC = () => {
  const { tableId: urlTableId } = useParams<{ tableId?: string }>();
  const navigate = useNavigate();
  const [activeTableId, setActiveTableId] = useState<string | null>(urlTableId || null);

  useEffect(() => {
    if (urlTableId) {
      setActiveTableId(urlTableId);
    }
  }, [urlTableId]);

  const handleLeaveTable = () => {
    setActiveTableId(null);
    if (urlTableId) {
      navigate('/games/teen-patti', { replace: true });
    }
  };

  const handleJoinTable = (tableId: string) => {
    setActiveTableId(tableId);
  };

  return (
    <div
      className="tp-page-container"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        overflowY: activeTableId ? 'hidden' : 'auto',
        overflowX: 'hidden',
        background: '#020617',
        WebkitOverflowScrolling: 'touch',
        touchAction: activeTableId ? 'none' : 'pan-y',
        overscrollBehaviorY: 'contain',
      }}
    >
      {activeTableId ? (
        <TeenPattiTable
          tableId={activeTableId}
          onLeaveTable={handleLeaveTable}
        />
      ) : (
        <TeenPattiLobby
          onJoinTable={handleJoinTable}
        />
      )}
    </div>
  );
};
