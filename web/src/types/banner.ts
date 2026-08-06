export interface Banner {
  id: string;
  imageUrl: string;
  // null = некликабельный. Иначе /category/..., /product/..., /search?...
  // или https://... Форму проверяет бэкенд.
  link: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}
