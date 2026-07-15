import { apiGet } from './client';
import type { Category, Product } from '../types';

export function getCategories(): Promise<Category[]> {
  return apiGet<Category[]>('/categories');
}

export function getCategoryPopularProduct(slug: string): Promise<Product> {
  return apiGet<Product>(`/categories/${slug}/popular-product`);
}
