import { apiGet } from './client';
import type { Product } from '../types';

export function getProductsByCategory(categoryId: string): Promise<Product[]> {
  return apiGet<Product[]>(`/products?categoryId=${encodeURIComponent(categoryId)}`);
}

export function getProductById(id: string): Promise<Product> {
  return apiGet<Product>(`/products/${encodeURIComponent(id)}`);
}

export function getRelatedProducts(id: string): Promise<Product[]> {
  return apiGet<Product[]>(`/products/${encodeURIComponent(id)}/related`);
}