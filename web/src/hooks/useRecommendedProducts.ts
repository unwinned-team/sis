import { useEffect, useState } from 'react';
import { getCategories, getCategoryPopularProduct } from '../api/categories';
import type { Product } from '../types';

interface UseRecommendedProductsResult {
  products: Product[];
  isLoading: boolean;
  error: string | null;
}

export function useRecommendedProducts(): UseRecommendedProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCategories()
      .then((categories) =>
        Promise.all(
          categories.map((category) =>
            getCategoryPopularProduct(category.slug).catch(() => null),
          ),
        ),
      )
      .then((results) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique = results.filter((product): product is Product => {
          if (!product || seen.has(product.id)) return false;
          seen.add(product.id);
          return true;
        });
        setProducts(unique);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити рекомендовані товари');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { products, isLoading, error };
}
