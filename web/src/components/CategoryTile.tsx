import { Link } from 'react-router-dom';
import { usePopularByCategory } from '../hooks/usePopularByCategory';
import type { Category } from '../types';

interface CategoryTileProps {
  category: Category;
}

export function CategoryTile({ category }: CategoryTileProps) {
  const { data: popular } = usePopularByCategory();
  // Фото ставить адмін у панелі. Хіт продажів підставляється лише категоріям
  // без власного фото — інакше правка в адмінці не доїжджала б до меню.
  const imageUrl = category.imageUrl || popular?.[category.slug]?.imageUrl;

  return (
    <Link
      to={`/category/${category.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/40 shadow-sm backdrop-blur-md transition duration-200 md:hover:-translate-y-1 md:hover:shadow-xl"
    >
      <div className="flex aspect-square shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-teal-100/40 to-sky-100/40">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={category.name}
            className="h-full w-full object-cover transition-transform duration-300 md:group-hover:scale-105"
          />
        ) : (
          <span className="text-xs text-slate-500">Фото буде тут</span>
        )}
      </div>
      {/* flex-1: плитки в ряду розтягуються до найвищої, тож однорядкова назва
          лишала б порожню смугу знизу — підпис забирає залишок і центрується. */}
      <span className="flex flex-1 items-center justify-center px-2 py-2 text-center text-lg font-bold text-slate-800">
        {category.name}
      </span>
    </Link>
  );
}
