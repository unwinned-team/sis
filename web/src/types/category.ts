export interface Category {
  id: string;
  name: string;
  slug: string;
  // Not in the current Prisma schema yet — reserved for when category photos are added.
  imageUrl?: string;
}
