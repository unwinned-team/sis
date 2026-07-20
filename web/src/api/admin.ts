import { apiRequest, apiUpload } from './client';
import type { Category, Order, OrderStatus, Product, ProductVariant } from '../types';

export interface AdminOrdersQuery {
  from?: string;
  to?: string;
  status?: OrderStatus;
  take?: number;
  skip?: number;
}

export interface AdminOrdersPage {
  orders: Order[];
  total: number;
  serverFiltered: boolean;
}

export async function getAdminOrders(
  accessToken: string,
  query: AdminOrdersQuery = {},
): Promise<AdminOrdersPage> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.status) params.set('status', query.status);
  if (query.take !== undefined) params.set('take', String(query.take));
  if (query.skip !== undefined) params.set('skip', String(query.skip));

  const search = params.toString();
  const raw = await apiRequest<Order[] | { orders: Order[]; total: number }>(
    `/orders${search ? `?${search}` : ''}`,
    { accessToken },
  );

  if (Array.isArray(raw)) {
    return { orders: raw, total: raw.length, serverFiltered: false };
  }
  return { orders: raw.orders, total: raw.total, serverFiltered: true };
}

export function setOrderStatus(
  accessToken: string,
  id: string,
  status: OrderStatus,
): Promise<Order> {
  return apiRequest<Order>(`/orders/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { status },
    accessToken,
  });
}

export function getAllProducts(): Promise<Product[]> {
  return apiRequest<Product[]>('/products');
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  imageUrl: string;
}

export function createProduct(accessToken: string, input: ProductInput): Promise<Product> {
  return apiRequest<Product>('/products', { method: 'POST', body: input, accessToken });
}

export function updateProduct(
  accessToken: string,
  id: string,
  input: Partial<ProductInput> & { isAvailable?: boolean },
): Promise<Product> {
  return apiRequest<Product>(`/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
    accessToken,
  });
}

export type DeleteProductOutcome = 'deleted' | 'archived';

export async function deleteProduct(
  accessToken: string,
  id: string,
): Promise<DeleteProductOutcome> {
  const result = await apiRequest<{ archived?: boolean } | undefined>(
    `/products/${encodeURIComponent(id)}`,
    { method: 'DELETE', accessToken },
  );
  return result?.archived ? 'archived' : 'deleted';
}

export interface VariantInput {
  taste?: string | null;
  size?: string | null;
  price?: number;
}

export function createVariant(
  accessToken: string,
  productId: string,
  input: VariantInput,
): Promise<ProductVariant> {
  return apiRequest<ProductVariant>(`/products/${encodeURIComponent(productId)}/variants`, {
    method: 'POST',
    body: input,
    accessToken,
  });
}

export function updateVariant(
  accessToken: string,
  productId: string,
  variantId: string,
  input: VariantInput,
): Promise<ProductVariant> {
  return apiRequest<ProductVariant>(
    `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    { method: 'PUT', body: input, accessToken },
  );
}

export function deleteVariant(
  accessToken: string,
  productId: string,
  variantId: string,
): Promise<void> {
  return apiRequest<void>(
    `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    { method: 'DELETE', accessToken },
  );
}

export interface CategoryInput {
  name: string;
  slug: string;
  imageUrl?: string | null;
}

export function createCategory(accessToken: string, input: CategoryInput): Promise<Category> {
  return apiRequest<Category>('/categories', { method: 'POST', body: input, accessToken });
}

export function updateCategory(
  accessToken: string,
  slug: string,
  input: Partial<CategoryInput>,
): Promise<Category> {
  return apiRequest<Category>(`/categories/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: input,
    accessToken,
  });
}

export function deleteCategory(accessToken: string, slug: string): Promise<void> {
  return apiRequest<void>(`/categories/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    accessToken,
  });
}

export function uploadImage(accessToken: string, file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('image', file);
  return apiUpload<{ url: string }>('/images/upload', form, accessToken);
}

export function replaceImage(
  accessToken: string,
  file: File,
  oldUrl: string,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append('image', file);
  form.append('oldUrl', oldUrl);
  return apiUpload<{ url: string }>('/images/replace', form, accessToken);
}
