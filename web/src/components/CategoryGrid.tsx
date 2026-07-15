import { useCategories } from '../hooks/useCategories';
import { CategoryTile } from './CategoryTile';

export function CategoryGrid() {
  const { categories, isLoading, error } = useCategories();

  if (isLoading) {
    return <p className="px-4 py-8 text-center text-slate-400">Завантаження категорій...</p>;
  }

  if (error) {
    return <p className="px-4 py-8 text-center text-red-500">{error}</p>;
  }

  if (categories.length === 0) {
    return <p className="px-4 py-8 text-center text-slate-400">Категорій поки немає</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((category) => (
        <CategoryTile key={category.id} category={category} />
      ))}
    </div>
  );
}
