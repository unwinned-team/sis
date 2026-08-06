import { apiGet } from './client';
import type { Banner } from '../types';

// Публичный список: только активные, уже в порядке sortOrder.
export function getBanners(): Promise<Banner[]> {
  return apiGet<Banner[]>('/banners');
}
