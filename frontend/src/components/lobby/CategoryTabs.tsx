import React from 'react';

const CATEGORIES = ['ALL', 'BACCARAT', 'SLOTS', 'POKER'];

interface Props {
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}

export const CategoryTabs: React.FC<Props> = ({ activeCategory, onCategoryChange }) => {
  return (
    <div className="category-tabs flex items-center gap-2">
      <button
        type="button"
        className="bind-phone-btn flex items-center gap-1 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-black text-[10px] px-2.5 py-1 rounded-full border border-orange-300 shadow-md shrink-0 cursor-pointer active:scale-95 transition"
        onClick={() => console.log('Bind Phone clicked')}
      >
        <span className="text-xs">📱</span>
        <span>Bind +₹10</span>
      </button>

      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          className={`category-tab ${activeCategory === cat ? 'category-tab--active' : ''}`}
          onClick={() => onCategoryChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};
