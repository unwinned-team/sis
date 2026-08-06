// Zod schemas for banners endpoints
//
// link: один рядок замість двох полів + enum (див. plan).
//   null   — некликабельный баннер
//   /category/<slug>  — внутр. CategoryPage
//   /product/<id>     — внутр. ProductPage
//   /search?...       — внутр. SearchPage
//   https://...       — зовн. URL (target=_blank, rel=noopener)
//   Все інше (http://, javascript:, /etc/passwd, ../) — 400.

import { z } from "zod";

// Slug = kebab-case, той самий патерн, що в Category (/server/src/schemas/categories.ts:9).
const slugTail = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Cuid ~25 символів [a-z0-9], перший — 'c'. Без зайвої строгості — баннер може
// посилатися на товар, який з'явиться пізніше, перевірки існування тут нема.
const cuidTail = /^c[a-z0-9]{8,}$/;

export const bannerLinkSchema = z
  .string()
  .min(1, "Link cannot be empty")
  .max(2048, "Link too long")
  .refine(
    (value) =>
      value.startsWith("/category/") ||
      value.startsWith("/product/") ||
      value.startsWith("/search?") ||
      value.startsWith("https://"),
    "Link must be an internal /category, /product, /search path or an https:// URL",
  )
  .refine((value) => {
    if (value.startsWith("/category/")) {
      const tail = value.slice("/category/".length);
      return slugTail.test(tail);
    }
    if (value.startsWith("/product/")) {
      const tail = value.slice("/product/".length);
      return cuidTail.test(tail);
    }
    if (value.startsWith("/search?")) {
      // Хоча б один query-параметр має бути; інакше це просто "/search?" сміття.
      return value.length > "/search?".length;
    }
    // https:// — просто непорожній шлях після хоста.
    return /^https:\/\/[^\s]+$/.test(value);
  }, "Link has invalid shape for its kind");

// POST /api/banners — обов'язкове imageUrl, link опційний, sortOrder за замовчуванням 0.
// isActive теж опційний: зручно створювати «чорновик», одразу схований з вітрини.
export const createBannerSchema = z.object({
  imageUrl: z.string().min(1, "Image URL is required"),
  link: bannerLinkSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/banners/:id — все опційно, link явно nullable (зняти кликабельність).
export const updateBannerSchema = z.object({
  imageUrl: z.string().min(1).optional(),
  link: bannerLinkSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const bannerParamsSchema = z.object({
  id: z.string().min(1, "Banner ID is required"),
});

// POST /api/banners/reorder — тільки id-и, в порядку нового sortOrder.
export const reorderBannersSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one id required"),
});
