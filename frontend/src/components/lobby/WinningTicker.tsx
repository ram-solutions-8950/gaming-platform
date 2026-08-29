import React from 'react';

interface TickerItem {
  username: string;
  amount: string;
  game: string;
}

const DEFAULT_ITEMS: TickerItem[] = [
  { username: 'Player***21', amount: '₹2,265', game: 'AVIATOR' },
  { username: 'Lucky***89', amount: '₹5,120', game: 'LUDO' },
  { username: 'Win***45', amount: '₹1,830', game: 'DRAGON TIGER' },
  { username: 'Star***77', amount: '₹3,650', game: 'CHICKEN ROAD' },
  { username: 'King***03', amount: '₹8,900', game: 'RUMMY' },
  { username: 'Pro***56', amount: '₹4,210', game: 'TEEN PATTI' },
  { username: 'Ace***12', amount: '₹6,740', game: 'LUDO' },
  { username: 'Top***34', amount: '₹2,990', game: 'AVIATOR' },
];

export const WinningTicker: React.FC<{ items?: TickerItem[] }> = ({ items = DEFAULT_ITEMS }) => {
  // Double the items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="winning-ticker">
      <div className="winning-ticker__icon">🏆</div>
      <div className="winning-ticker__track">
        <div className="winning-ticker__content">
          {doubled.map((item, i) => (
            <span key={i} className="winning-ticker__item">
              <span className="winning-ticker__user">{item.username}</span>
              {' Won '}
              <span className="winning-ticker__amount">{item.amount}</span>
              {' in '}
              <span className="winning-ticker__game">{item.game}</span>
              <span className="winning-ticker__separator">•</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
