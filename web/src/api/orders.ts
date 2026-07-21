import { apiRequest } from './client';
import type { Order, PaymentMethod, ShippingAddress } from '../types';

export interface CreateOrderInput {
  paymentMethod: PaymentMethod;
  items: Array<{ productId: string; quantity: number }>;
  shippingAddress?: ShippingAddress;
}

export function createOrder(accessToken: string, input: CreateOrderInput): Promise<Order> {
  return apiRequest<Order>('/orders', {
    method: 'POST',
    body: input,
    accessToken,
  });
}

// GET /orders отдаёт {orders, total}; голый массив — формат до пагинации,
// поддерживается чтобы фронт и бэкенд можно было выкатывать раздельно.
export async function getMyOrders(accessToken: string): Promise<Order[]> {
  const raw = await apiRequest<Order[] | { orders: Order[]; total: number }>('/orders', {
    accessToken,
  });
  return Array.isArray(raw) ? raw : raw.orders;
}

export function cancelOrder(accessToken: string, id: string): Promise<void> {
  return apiRequest<void>(`/orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    accessToken,
  });
}
