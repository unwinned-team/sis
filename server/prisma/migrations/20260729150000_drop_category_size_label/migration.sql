-- Друга вісь варіантів не використовувалась: у каталозі всі ProductVariant.size = NULL,
-- тому підпис для неї лише плутав адміна двома однаковими полями.
ALTER TABLE "Category" DROP COLUMN "sizeLabel";
