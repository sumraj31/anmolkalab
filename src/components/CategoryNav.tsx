import React from 'react';

interface CategoryNavProps {
  categories: string[];
  activeCategory: string;
  onSelectCategory: (category: string) => void;
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <nav className="cats" id="cats" aria-label="Product categories">
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          className={`cat ${activeCategory === cat ? 'active' : ''}`}
          onClick={() => onSelectCategory(cat)}
        >
          {cat}
        </button>
      ))}
    </nav>
  );
};
