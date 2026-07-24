import { useEffect, useState } from 'react';
import { getCategoryPopularProduct } from '../api/categories';
import { ProductCard } from './ProductCard';
import type { Category, Product } from '../types';

interface MegaMenuProps {
  category: Category;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  topOffset?: number | null;
}

export function MegaMenu({ category, onMouseEnter, onMouseLeave, topOffset }: MegaMenuProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getCategoryPopularProduct(category.slug)
      .then((data) => {
        if (!cancelled) {
          setProduct(data);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити товар');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [category.slug]);

  const hasOffset = topOffset !== null && topOffset !== undefined;
  let safeTop: number | undefined = undefined;
  if (hasOffset) {
    // ProductCard is w-[260px], image is aspect 3/4 (346px height), plus text (100px). Total ~450px.
    const cardHeight = 450;
    const maxTop = typeof window !== 'undefined' ? window.innerHeight - cardHeight - 16 : 1000;
    safeTop = Math.max(16, Math.min(topOffset, maxTop));
  }

  return (
    <div 
      className={`fixed right-[19rem] z-50 hidden lg:flex ${hasOffset ? '' : 'top-1/2 -translate-y-1/2'}`}
      style={hasOffset ? { top: safeTop } : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {product && (
        <div className="w-[260px] rounded-2xl shadow-2xl shadow-black/30 ring-1 ring-black/5">
          <ProductCard product={product} showCategory={false} customBadge="🔥 Хіт категорії" />
        </div>
      )}
    </div>
  );
}
