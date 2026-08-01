-- variant.price тепер nullable: null = наслідує product.price.
ALTER TABLE "ProductVariant" ALTER COLUMN "price" DROP NOT NULL;

-- Всі існуючі варіанти переходять на inherit: копію ціни більше не потрібно
-- підтримувати вручну — зміна product.price одразу видно на вітрині.
UPDATE "ProductVariant" SET "price" = NULL;