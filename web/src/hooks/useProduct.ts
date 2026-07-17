import { useEffect, useState } from 'react';
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

interface ProductState {
  id: string | undefined;
  product: Product | null;
  relatedProducts: Product[];
  notFound: boolean;
  error: string | null;
}

const EMPTY_STATE: ProductState = {
  id: undefined,
  product: null,
  relatedProducts: [],
  notFound: false,
  error: null,
};

export function useProduct(id: string | undefined): UseProductResult {
  const [state, setState] = useState<ProductState>(EMPTY_STATE);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    Promise.all([getProductById(id), getRelatedProducts(id).catch(() => [])])
      .then(([product, relatedProducts]) => {
        if (cancelled) return;
        setState({ id, product, relatedProducts, notFound: false, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const isNotFound = cause instanceof ApiError && cause.status === 404;
        setState({
          ...EMPTY_STATE,
          id,
          notFound: isNotFound,
          error: isNotFound ? null : 'Не вдалося завантажити товар',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const isCurrent = id !== undefined && state.id === id;

  return {
    product: isCurrent ? state.product : null,
    relatedProducts: isCurrent ? state.relatedProducts : [],
    isLoading: id !== undefined && !isCurrent,
    notFound: !id || (isCurrent && state.notFound),
    error: isCurrent ? state.error : null,
  };
}
