import { useContext } from 'react';
import { CartContext } from '../context/cart-context';
import type { CartContextValue } from '../context/cart-context';

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
