import { useCallback, useEffect, useState } from 'react';
import { getMyOrders } from '../api/orders';
import type { Order } from '../types';

interface MyOrdersState {
  orders: Order[];
  loadedFor: string | null;
  error: string | null;
}

const INITIAL_STATE: MyOrdersState = { orders: [], loadedFor: null, error: null };

export function useMyOrders(accessToken: string | null) {
  const [state, setState] = useState<MyOrdersState>(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getMyOrders(accessToken)
      .then((orders) => {
        if (cancelled) return;
        setState({ orders, loadedFor: accessToken, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ orders: [], loadedFor: accessToken, error: 'Не вдалося завантажити замовлення.' });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, reloadKey]);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return {
    orders: state.orders,
    isLoading: accessToken !== null && state.loadedFor !== accessToken,
    error: state.error,
    reload,
  };
}
