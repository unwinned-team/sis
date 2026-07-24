import { createContext } from 'react';
import type { CartItem, Product, ProductVariant, ShippingAddress } from '../types';

// Один рядок кошика = товар + конкретний варіант (смак/об'єм).
export function cartLineId(item: Pick<CartItem, 'productId' | 'variantId'>): string {
  return item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
}

export interface CartContextValue {
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
  addItem: (product: Product, quantity?: number, variant?: ProductVariant | null) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  shippingAddress: ShippingAddress;
  setShippingAddress: (address: ShippingAddress) => void;
}

export const CartContext = createContext<CartContextValue | null>(null);
