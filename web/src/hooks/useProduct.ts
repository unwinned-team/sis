import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { getProductById, getRelatedProducts } from '../api/products';
import type { Product } from '../types';

interface UseProductResult {
  product: Product | null;
  relatedProducts: Product[];
  isLoading: boolean;
  notFound: boolean;
  error: string | null;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function useProduct(id: string | undefined): UseProductResult {
  const { data, isPending, error } = useQuery({
    queryKey: ['product', id],
    enabled: id !== undefined,
    retry: (failureCount, err) => !isNotFound(err) && failureCount < 1,
    queryFn: async () => {
      const [product, relatedProducts] = await Promise.all([
        getProductById(id!),
        getRelatedProducts(id!).catch(() => [] as Product[]),
      ]);
      return { product, relatedProducts };
    },
  });

  return {
    product: data?.product ?? null,
    relatedProducts: data?.relatedProducts ?? [],
    isLoading: id !== undefined && isPending,
    notFound: !id || isNotFound(error),
    error: error && !isNotFound(error) ? 'Не вдалося завантажити товар' : null,
  };
}
