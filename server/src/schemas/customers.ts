import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Invalid email"));

export const customerParamsSchema = z.object({
  id: z.string().min(1, "Customer ID is required"),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: emailSchema.optional(),
  phone: z.string().min(1, "Phone is required").optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: emailSchema.optional(),
  phone: z.string().min(1).optional(),
});

// role сознательно не входит в create/update: повышение — отдельный роут с
// собственными гардами, чтобы его нельзя было выполнить «мимоходом».
// take/skip без значений по умолчанию: отсутствие параметров = «отдать всех»,
// как было до появления фильтра, иначе существующие потребители молча
// получили бы усечённый список.
export const listCustomersQuerySchema = z
  .object({
    role: z.enum(["CUSTOMER", "ADMIN"]).optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const updateCustomerRoleSchema = z
  .object({ role: z.enum(["CUSTOMER", "ADMIN"]) })
  .strict();

export const updateCustomerActiveSchema = z
  .object({ isActive: z.boolean() })
  .strict();
