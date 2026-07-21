import { createContext } from 'react';
import type { CartItem, Product, ShippingAddress } from '../types';

export interface CartContextValue {
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
  addItem: (product: Product, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  shippingAddress: ShippingAddress;
  setShippingAddress: (address: ShippingAddress) => void;
}

export const CartContext = createContext<CartContextValue | null>(null);
