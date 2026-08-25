import React, { useState } from 'react';
import { TeenPattiLobby } from '../../components/teenPatti/TeenPattiLobby';
import { TeenPattiTable } from '../../components/teenPatti/TeenPattiTable';
import '../../styles/teen-patti.css';

export const TeenPatti: React.FC = () => {
  const [activeTableId, setActiveTableId] = useState<string | null>(null);

  return (
    <div style={{ height: '100dvh', maxHeight: '100dvh', overflow: 'hidden', background: '#020617' }}>
      {activeTableId ? (
        <TeenPattiTable
          tableId={activeTableId}
          onLeaveTable={() => setActiveTableId(null)}
        />
      ) : (
        <TeenPattiLobby
          onJoinTable={(tableId) => setActiveTableId(tableId)}
        />
      )}
    </div>
  );
};
