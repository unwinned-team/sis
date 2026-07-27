import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCategoryPopularProduct } from '../api/categories';
import { CATEGORIES_QUERY } from './useCategories';
import type { Product } from '../types';

export const POPULAR_BY_CATEGORY_KEY = ['popular-by-category'] as const;

/**
 * Хіт продажів кожної категорії (за сумою проданих одиниць), у вигляді мапи
 * slug -> товар. Категорії без замовлень бекенд віддає як 404 — вони просто
 * відсутні в мапі.
 *
 * Один фанаут на всі категорії: і блок «рекомендованих», і фото плиток
 * читають цей же ключ, тому react-query виконує запити один раз.
 */
export function usePopularByCategory() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: POPULAR_BY_CATEGORY_KEY,
    queryFn: async () => {
      const categories = await queryClient.ensureQueryData(CATEGORIES_QUERY);
      const entries = await Promise.all(
        categories.map(
          async (category) =>
            [
              category.slug,
              await getCategoryPopularProduct(category.slug).catch(() => null),
            ] as const,
        ),
      );

      const popular: Record<string, Product> = {};
      for (const [slug, product] of entries) {
        if (product) popular[slug] = product;
      }
      return popular;
    },
  });
}
