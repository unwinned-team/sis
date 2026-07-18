# Админ-панель Ice-Shop — план реализации (backend)

Цели: смена наличия товара (блокировка покупки), изменение цен, заказы за период + архив, подтверждение/отклонение заказов, CRUD товаров и категорий, уборка старых.

Всё новое — только под `requireAuth, requireAdmin` (механика уже есть). Публичные GET остаются публичными.

Обновлено после PR #30 (admin image uploads + category management): CRUD категорий и загрузка картинок уже реализованы — вычеркнуты из плана, зафиксированы в §4.

## Зафиксированные решения

- **Наличие:** флаг `isAvailable` на Product. Товар остаётся видимым в каталоге (фронт покажет «Немає в наявності»), но `POST /orders` с таким товаром отвечает 409.
- **Уборка старых:** физическое удаление невозможно для товаров с историей заказов (`OrderItem.product` стоит `onDelete: Restrict` — и это правильно, история заказов не должна ломаться). Поэтому **мягкое архивирование**: флаг `isArchived`. Архивный товар исчезает из всех публичных выдач полностью (в отличие от `isAvailable=false`).
- **Подтверждение/отклонение заказа:** бэкенд уже готов — `PUT /api/v1/orders/:id` со сменой статуса (переходы, идемпотентность, бонусы, защита от гонок реализованы). Кнопки: «Подтвердить» = `{status:"PROCESSING"}`, «Отклонить» = `{status:"CANCELLED"}`. На бэке менять ничего не нужно.
- **7 дней / архив:** не отдельные эндпоинты, а фильтры `from`/`to` + пагинация на существующем `GET /orders`. «7 дней» фронт задаёт сам (`from = now − 7d`), «архив за всё время» — тот же список без `from` с пагинацией.
- **Варианты (вкусы/объёмы):** CRUD-эндпоинтов нет вообще, варианты живут только в сиде. Для «изменения цены» нужны эндпоинты и по вариантам.

## 1. Схема Prisma — миграция `add_admin_catalog` (аддитивная)

```prisma
model Product {
  isAvailable Boolean @default(true)
  isArchived  Boolean @default(false)
  @@index([categoryId, isArchived])
}

model Order {
  @@index([createdAt])
  @@index([status, createdAt])
}
```

Сид: пометить 1–2 товара `isAvailable: false` для проверки фронта.

## 2. Эндпоинты — осталось сделать

| Метод/путь | Auth | Тело / query | Поведение |
| --- | --- | --- | --- |
| `PUT /products/:id` | admin | + `isAvailable?: boolean` | **смена наличия и цены** — расширить существующую схему (price там уже есть) |
| `DELETE /products/:id` | admin | — | нет позиций в заказах → физическое удаление (варианты каскадом); есть → `isArchived = true`, ответ `200 {archived: true}` |
| `GET /products*` (все публичные выдачи, related, popular) | публично | — | всегда `where isArchived: false`; `isAvailable` отдаётся в JSON |
| `POST /products/:id/variants` | admin | `{taste?, size?, price}` | |
| `PUT /products/:id/variants/:variantId` | admin | `{taste?, size?, price?}` | **изменение цены варианта** |
| `DELETE /products/:id/variants/:variantId` | admin | — | |
| `GET /orders` | auth (как сейчас) | `?from&to&status&take&skip` | фильтр по `createdAt`, `take` ≤ 100 (default 50), ответ `{orders, total}` для пагинации архива |
| `POST /orders` | auth | — | добавить проверку: товар `isAvailable=false` или `isArchived=true` → `409 {error: "Products unavailable", productIds: [...]}` |

## 3. Zod-схемы — осталось сделать

- `schemas/products.ts`: в `updateProductSchema` добавить `isAvailable: z.boolean().optional()`; схемы вариантов (`price` — существующий `priceSchema`; `taste`/`size` — строки, хотя бы одно из полей).
- `schemas/orders.ts`: `listOrdersQuerySchema` — `from`/`to` ISO-datetime optional, `status` enum optional, `take` 1..100 default 50, `skip` ≥ 0 default 0.
- **Баг `imageUrl` у товаров (подтверждён, стал критичным после #30):** `POST /images/upload` возвращает локальный путь `/uploads/<uuid>.jpg`, но `createProductSchema`/`updateProductSchema` требуют `z.url()` — создать/обновить товар с загруженной картинкой невозможно. У категорий уже `z.string()`. Исправить: `z.union([z.url(), z.string().regex(/^\/[\w\-./]+$/)])` (или `z.string()` как у категорий).

## 4. Что уже готово и не трогаем

- **Категории (PR #30):** `POST /categories` `{name, slug, imageUrl?}` (slug обязателен, `^[a-z0-9-]+$`), `PUT /categories/:slug`, `DELETE /categories/:slug` — 409 для непустой; `Category.imageUrl String?` в схеме.
- **Картинки (PR #30):** `POST /api/v1/images/upload` (multipart `image`, jpeg/png, до 10 МБ) → `201 {url: "/uploads/<uuid>.ext"}`; `POST /images/replace` (`image` + `oldUrl` — удаляет старый файл); `DELETE /images` `{url}`. Всё admin-only, защита от path traversal, статика `/uploads` на бэке + vite-proxy на фронте, файлы вне git.
- `PUT /orders/:id`: переходы `NEW → PROCESSING|COMPLETED|CANCELLED`, `PROCESSING → COMPLETED|CANCELLED`, терминальные заблокированы; идемпотентный повтор того же статуса; +1% бонуса при COMPLETED (кроме BONUS-оплаты); возврат бонусов при CANCELLED BONUS-заказа; защита от конкурентной смены.
- `DELETE /orders/:id` (отмена клиентом своего NEW) — не пересекается с админскими кнопками.
- Guard-механика `requireAuth`/`requireAdmin` с проверкой админа по БД.

## 5. Тесты

- Unit: новые zod-схемы (variants, list-orders query, ослабленный `imageUrl`).
- Integration: `PUT /products/:id {isAvailable:false}` → `POST /orders` с этим товаром → 409; архивирование товара с заказами и исчезновение из публичных выдач; физическое удаление товара без заказов; смена цены варианта; `GET /orders?from&to` + пагинация (total, take/skip); создание товара с `imageUrl: "/uploads/..."`; 403 для CUSTOMER на всех новых админ-роутах.

## 6. Порядок реализации

1. Миграция + сид (`isAvailable`, `isArchived`, индексы по `createdAt`).
2. Zod-схемы (+ починить `imageUrl` товаров — быстрый фикс, разблокирует связку upload → создание товара).
3. Products: `isAvailable` в PUT, новое поведение DELETE, фильтр `isArchived` в публичных GET.
4. Проверка доступности в `POST /orders`.
5. Variants CRUD.
6. Фильтры/пагинация `GET /orders`.
7. Тесты; `server:check`, `server:test`, `server:test:integration`.

## Известные пробелы (не в этом этапе)

- **Заказ не знает про вариант:** в `OrderItem` нет `variantId`, сумма считается по базовой `product.price`. Покупка конкретного вкуса/объёма по цене варианта — отдельный этап (поле `variantId String?` + цена из варианта в `createOrder`).
- Наличие на уровне варианта (закончился только вкус «Манго») — при необходимости добавить `isAvailable` и на `ProductVariant`.
- Чистка осиротевших файлов в `uploads/` (картинка загружена, но товар так и не создан) — периодическая задача или сверка при старте, некритично.
