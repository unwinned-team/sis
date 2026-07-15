import { Link } from 'react-router-dom';
import type { Category } from '../types';

interface CategoryTileProps {
  category: Category;
}

export function CategoryTile({ category }: CategoryTileProps) {
  return (
    <Link
      to={`/category/${category.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-slate-200 transition-transform duration-200 md:hover:-translate-y-1 md:hover:shadow-lg"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-slate-300">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt={category.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-slate-500">Фото буде тут</span>
        )}
      </div>
      <span className="px-2 py-2 text-center text-lg font-bold text-slate-800">{category.name}</span>
    </Link>
  );
}
