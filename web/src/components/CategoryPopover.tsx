import { useEffect, useState } from 'react';
import { getCategoryPopularProduct } from '../api/categories';
import type { Category, Product } from '../types';

interface CategoryPopoverProps {
  category: Category;
  onClose: () => void;
}

export function CategoryPopover({ category, onClose }: CategoryPopoverProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCategoryPopularProduct(category.slug)
      .then((data) => {
        if (!cancelled) setProduct(data);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити товар');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category.slug]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-500">Популярне у «{category.name}»</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {isLoading && <p className="text-sm text-slate-500">Завантаження...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {product && (
          <div className="flex gap-3">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-20 w-20 shrink-0 rounded-lg object-cover"
            />
            <div>
              <p className="font-medium text-slate-900">{product.name}</p>
              <p className="text-sm text-slate-500">{product.price} грн</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
