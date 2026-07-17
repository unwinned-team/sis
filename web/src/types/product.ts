import type { Category } from './category';

export interface ProductVariant {
  id: string;
  productId: string;
  taste: string | null;
  size: string | null;
  price: string;
  description?: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  createdAt: string;
  category?: Category;
  variants?: ProductVariant[];
}
