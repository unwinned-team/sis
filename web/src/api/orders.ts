import { apiRequest } from './client';
import type { Order } from '../types';

export function getMyOrders(accessToken: string): Promise<Order[]> {
  return apiRequest<Order[]>('/orders', { accessToken });
}

export function cancelOrder(accessToken: string, id: string): Promise<void> {
  return apiRequest<void>(`/orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    accessToken,
  });
}
