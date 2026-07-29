export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  isArchived?: boolean;
  // Підпис вибору варіанта: «Опір» для картриджів, «Колір» для pod-систем.
  // null/undefined — дефолт «Смак».
  tasteLabel?: string | null;
}
