import { useEffect, useState } from 'react';
import { getCategories, getCategoryPopularProduct } from '../api/categories';
import { getProductsByCategory } from '../api/products';
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

interface DetailsState {
  slug: string | undefined;
  category: Category | null;
  otherCategories: Category[];
  popularProduct: Product | null;
  products: Product[];
  notFound: boolean;
  error: string | null;
}

const EMPTY_STATE: DetailsState = {
  slug: undefined,
  category: null,
  otherCategories: [],
  popularProduct: null,
  products: [],
  notFound: false,
  error: null,
};

export function useCategoryDetails(slug: string | undefined): UseCategoryDetailsResult {
  const [state, setState] = useState<DetailsState>(EMPTY_STATE);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    getCategories()
      .then(async (categories) => {
        if (cancelled) return;

        const current = categories.find((item) => item.slug === slug) ?? null;
        if (!current) {
          setState({ ...EMPTY_STATE, slug, notFound: true });
          return;
        }

        const [product, products] = await Promise.all([
          getCategoryPopularProduct(slug).catch(() => null),
          getProductsByCategory(current.id),
        ]);
        if (cancelled) return;

        setState({
          slug,
          category: current,
          otherCategories: categories.filter((item) => item.slug !== slug),
          popularProduct: product,
          products,
          notFound: false,
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ ...EMPTY_STATE, slug, error: 'Не вдалося завантажити категорію' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const isCurrent = slug !== undefined && state.slug === slug;

  return {
    category: isCurrent ? state.category : null,
    otherCategories: isCurrent ? state.otherCategories : [],
    popularProduct: isCurrent ? state.popularProduct : null,
    products: isCurrent ? state.products : [],
    isLoading: slug !== undefined && !isCurrent,
    notFound: !slug || (isCurrent && state.notFound),
    error: isCurrent ? state.error : null,
  };
}
