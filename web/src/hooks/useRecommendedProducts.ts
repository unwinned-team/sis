import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCategoryPopularProduct } from '../api/categories';
import { CATEGORIES_QUERY } from './useCategories';
import type { Product } from '../types';

interface UseRecommendedProductsResult {
  products: Product[];
  isLoading: boolean;
  error: string | null;
}

export function useRecommendedProducts(): UseRecommendedProductsResult {
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['recommended-products'],
    queryFn: async () => {
      const categories = await queryClient.ensureQueryData(CATEGORIES_QUERY);
      const results = await Promise.all(
        categories.map((category) => getCategoryPopularProduct(category.slug).catch(() => null)),
      );
      const seen = new Set<string>();
      return results.filter((product): product is Product => {
        if (!product || seen.has(product.id)) return false;
        seen.add(product.id);
        return true;
      });
    },
  });

  return {
    products: data ?? [],
    isLoading: isPending,
    error: isError ? 'Не вдалося завантажити рекомендовані товари' : null,
  };
}
