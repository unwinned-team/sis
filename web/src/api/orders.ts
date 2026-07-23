import { apiRequest } from './client';
import type { Order, PaymentMethod, ShippingAddress } from '../types';

export interface CreateOrderInput {
  paymentMethod: PaymentMethod;
  items: Array<{ productId: string; quantity: number }>;
  shippingAddress?: ShippingAddress;
}

export function createOrder(accessToken: string, input: CreateOrderInput): Promise<Order> {
  // Бекенд приймає адресу пласкими полями deliveryCity/deliveryRegion/deliveryBranch.
  const { shippingAddress, ...rest } = input;
  return apiRequest<Order>('/orders', {
    method: 'POST',
    body: {
      ...rest,
      ...(shippingAddress && {
        deliveryCity: shippingAddress.city,
        deliveryRegion: shippingAddress.oblast,
        deliveryBranch: shippingAddress.branch,
      }),
    },
    accessToken,
  });
}

export function getOrder(accessToken: string, id: string): Promise<Order> {
  return apiRequest<Order>(`/orders/${encodeURIComponent(id)}`, { accessToken });
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
