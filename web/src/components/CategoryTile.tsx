import { Link } from 'react-router-dom';
import type { Category } from '../types';

interface CategoryTileProps {
  category: Category;
}

export function CategoryTile({ category }: CategoryTileProps) {
  return (
    <Link
      to={`/category/${category.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/40 shadow-sm backdrop-blur-md transition duration-200 md:hover:-translate-y-1 md:hover:shadow-xl"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-100/40 to-sky-100/40">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt={category.name}
            className="h-full w-full object-cover transition-transform duration-300 md:group-hover:scale-105"
          />
        ) : (
          <span className="text-xs text-slate-500">Фото буде тут</span>
        )}
      </div>
      <span className="px-2 py-2 text-center text-lg font-bold text-slate-800">{category.name}</span>
    </Link>
  );
}
