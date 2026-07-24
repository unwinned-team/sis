import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCategoryPopularProduct } from '../api/categories';
import { getProductsByCategory } from '../api/products';
import { CATEGORIES_QUERY } from './useCategories';
import type { Category, Product } from '../types';

interface UseCategoryDetailsResult {
  category: Category | null;
  otherCategories: Category[];
  popularProduct: Product | null;
  products: Product[];
  isLoading: boolean;
  notFound: boolean;
  error: string | null;
}

export function useCategoryDetails(slug: string | undefined): UseCategoryDetailsResult {
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['category', slug],
    enabled: slug !== undefined,
    queryFn: async () => {
      // ensureQueryData ділить кеш зі списком категорій замість повторного запиту.
      const categories = await queryClient.ensureQueryData(CATEGORIES_QUERY);
      const current = categories.find((item) => item.slug === slug) ?? null;
      if (!current) {
        return {
          notFound: true,
          category: null,
          otherCategories: [] as Category[],
          popularProduct: null,
          products: [] as Product[],
        };
      }

      const [popularProduct, products] = await Promise.all([
        getCategoryPopularProduct(slug!).catch(() => null),
        getProductsByCategory(current.id),
      ]);

      return {
        notFound: false,
        category: current as Category | null,
        otherCategories: categories.filter((item) => item.slug !== slug),
        popularProduct,
        products,
      };
    },
  });

  return {
    category: data?.category ?? null,
    otherCategories: data?.otherCategories ?? [],
    popularProduct: data?.popularProduct ?? null,
    products: data?.products ?? [],
    isLoading: slug !== undefined && isPending,
    notFound: !slug || (data?.notFound ?? false),
    error: isError ? 'Не вдалося завантажити категорію' : null,
  };
}
