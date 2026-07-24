import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyOrders } from '../api/orders';

export function useMyOrders(accessToken: string | null) {
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['my-orders', accessToken],
    enabled: accessToken !== null,
    queryFn: () => getMyOrders(accessToken!),
  });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
  }, [queryClient]);

  return {
    orders: data ?? [],
    isLoading: accessToken !== null && isPending,
    error: isError ? 'Не вдалося завантажити замовлення.' : null,
    reload,
  };
}
