import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CartContext, cartLineId } from './cart-context';
import type { CartItem, Product, ProductVariant, ShippingAddress } from '../types';

const STORAGE_KEY = 'ice-shop.cart.v1';
const SHIPPING_KEY = 'ice-shop.cart.shipping.v1';
const MAX_QUANTITY = 99;
const EMPTY_ADDRESS: ShippingAddress = { city: '', oblast: '', branch: '', phone: '', telegram: '' };

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const optionalString = (v: unknown) => typeof v === 'string' || v === null || v === undefined;
  return (
    typeof item.productId === 'string' &&
    item.productId.length > 0 &&
    optionalString(item.variantId) &&
    optionalString(item.taste) &&
    optionalString(item.size) &&
    typeof item.name === 'string' &&
    typeof item.price === 'string' &&
    typeof item.imageUrl === 'string' &&
    typeof item.quantity === 'number' &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0
  );
}

function readStoredItems(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter(isCartItem)
      // Кошики, збережені до появи варіантів, не мають нових полів.
      .map((item) => ({
        ...item,
        variantId: item.variantId ?? null,
        taste: item.taste ?? null,
        size: item.size ?? null,
      }))
      .filter((item) => {
        const lineId = cartLineId(item);
        if (seen.has(lineId)) return false;
        seen.add(lineId);
        return true;
      });
  } catch {
    return [];
  }
}

function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_QUANTITY);
}

function readStoredAddress(): ShippingAddress {
  try {
    const raw = localStorage.getItem(SHIPPING_KEY);
    if (!raw) return EMPTY_ADDRESS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_ADDRESS;
    const { city, oblast, branch, phone, telegram } = parsed as Record<string, unknown>;
    return {
      city: typeof city === 'string' ? city : '',
      oblast: typeof oblast === 'string' ? oblast : '',
      branch: typeof branch === 'string' ? branch : '',
      phone: typeof phone === 'string' ? phone : '',
      telegram: typeof telegram === 'string' ? telegram : '',
    };
  } catch {
    return EMPTY_ADDRESS;
  }
}

interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>(readStoredItems);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>(readStoredAddress);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      return;
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(SHIPPING_KEY, JSON.stringify(shippingAddress));
    } catch {
      return;
    }
  }, [shippingAddress]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setItems(readStoredItems());
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const addItem = useCallback(
    (product: Product, quantity = 1, variant: ProductVariant | null = null) => {
      setItems((current) => {
        const variantId = variant?.id ?? null;
        const existing = current.find(
          (item) => item.productId === product.id && item.variantId === variantId,
        );
        if (existing) {
          const lineId = cartLineId(existing);
          return current.map((item) =>
            cartLineId(item) === lineId
              ? { ...item, quantity: clampQuantity(item.quantity + quantity) }
              : item,
          );
        }
        return [
          ...current,
          {
            productId: product.id,
            variantId,
            taste: variant?.taste ?? null,
            size: variant?.size ?? null,
            name: product.name,
            price: variant?.price ?? product.price,
            imageUrl: product.imageUrl,
            quantity: clampQuantity(quantity),
          },
        ];
      });
    },
    [],
  );

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setItems((current) =>
      current.map((item) =>
        cartLineId(item) === lineId ? { ...item, quantity: clampQuantity(quantity) } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((current) => current.filter((item) => cartLineId(item) !== lineId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => {
      const price = Number(item.price);
      return Number.isNaN(price) ? sum : sum + price * item.quantity;
    }, 0);
    return {
      items,
      totalQuantity,
      totalAmount,
      addItem,
      setQuantity,
      removeItem,
      clear,
      shippingAddress,
      setShippingAddress,
    };
  }, [items, addItem, setQuantity, removeItem, clear, shippingAddress]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
