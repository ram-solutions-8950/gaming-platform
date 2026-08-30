import React from 'react';

export const DEFAULT_CATEGORIES = ['ALL', 'CASINO', 'CARDS', 'SLOTS'];

interface Props {
  categories?: string[];
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}

export const CategoryTabs: React.FC<Props> = ({
  categories = DEFAULT_CATEGORIES,
  activeCategory,
  onCategoryChange,
}) => {
  return (
    <div className="category-tabs flex items-center gap-2">
      {categories.map((cat) => (
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
