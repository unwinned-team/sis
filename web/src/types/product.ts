import type { Category } from './category';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  createdAt: string;
  category?: Category;
}
