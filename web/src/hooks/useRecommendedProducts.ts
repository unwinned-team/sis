import { usePopularByCategory } from './usePopularByCategory';
import type { Product } from '../types';

interface UseRecommendedProductsResult {
  products: Product[];
  isLoading: boolean;
  error: string | null;
}

export function useRecommendedProducts(): UseRecommendedProductsResult {
  const { data, isPending, isError } = usePopularByCategory();

  // Один товар може бути хітом лише своєї категорії, але підстраховка від
  // дублів у стрічці лишається — категорії обходяться по порядку.
  const seen = new Set<string>();
  const products = Object.values(data ?? {}).filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });

  return {
    products,
    isLoading: isPending,
    error: isError ? 'Не вдалося завантажити рекомендовані товари' : null,
  };
}
