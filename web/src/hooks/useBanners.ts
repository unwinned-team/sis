import { useQuery } from '@tanstack/react-query';
import { getBanners } from '../api/banners';
import type { Banner } from '../types';

export const BANNERS_QUERY = {
  queryKey: ['banners'] as const,
  queryFn: getBanners,
};

// Без error-состояния: при ошибке карусель просто не рендерится.
export function useBanners(): { banners: Banner[]; isLoading: boolean } {
  const { data, isPending } = useQuery(BANNERS_QUERY);

  return { banners: data ?? [], isLoading: isPending };
}
