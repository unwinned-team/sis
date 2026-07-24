export interface CartItem {
  productId: string;
  // Вибраний варіант; null — товар без варіантів (або доданий до їх появи).
  variantId: string | null;
  taste: string | null;
  size: string | null;
  name: string;
  price: string;
  imageUrl: string;
  quantity: number;
}

export interface ShippingAddress {
  city: string;
  oblast: string;
  branch: string;
  phone: string;
  telegram: string;
}
