import { useQuery } from '@tanstack/react-query';
import { getCategories } from '../api/categories';
import type { Category } from '../types';

interface UseCategoriesResult {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
}

export const CATEGORIES_QUERY = {
  queryKey: ['categories'] as const,
  queryFn: getCategories,
};

export function useCategories(): UseCategoriesResult {
  const { data, isPending, isError } = useQuery(CATEGORIES_QUERY);

  return {
    categories: data ?? [],
    isLoading: isPending,
    error: isError ? 'Не вдалося завантажити категорії' : null,
  };
}
