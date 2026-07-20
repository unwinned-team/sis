# Админ-панель Ice-Shop — план реализации (backend)

Цели: смена наличия товара (блокировка покупки), изменение цен, заказы за период + архив, подтверждение/отклонение заказов, CRUD товаров и категорий, уборка старых.

Всё новое — только под `requireAuth, requireAdmin` (механика уже есть). Публичные GET остаются публичными.

Обновлено после PR #30 (admin image uploads + category management): CRUD категорий и загрузка картинок уже реализованы — вычеркнуты из плана, зафиксированы в §7.

Обновлено после реализации фронтенда админки (ветка `adminpan`): UI написан целиком и уже вызывает все эндпоинты из этого документа, включая ещё не существующие. §0 — что проверено на живом сервере, §6 — два решения, которые нужно принять до начала работы.

---

## 0. Что проверено на живом сервере

Не из документации, а фактическими запросами к `localhost:4000` под токеном сид-админа (`admin@example.test`). Это точка отсчёта — состояние бэкенда на момент написания.

| Проверка | Результат | Следствие |
| --- | --- | --- |
| `GET /orders?from=...&take=5` | **массив** из 24 заказов, query-параметры игнорируются | пагинации/фильтров нет; фронт фильтрует в браузере |
| Состав элемента `GET /orders` | `id, customerId, totalAmount, paymentMethod, status, createdAt, customer{id,name,phone}, items[]` | `customer` уже приходит — имя/телефон в панели есть без доработок |
| `GET /products` | 120 товаров, поля `isAvailable` **нет** | фронт определяет отсутствие фичи по отсутствию поля |
| `PUT /products/:id {"isAvailable":false}` | **`200 OK`, поле молча отброшено, товар не изменён** | см. §2 — самый опасный кейс |
| `POST /products/:id/variants` | `404`, `Content-Type: text/html` | роута нет; в `app.ts` нет JSON-обработчика 404 |
| `POST /products {"imageUrl":"/uploads/test.jpg"}` | `400 invalid_format`, `format: "url"` | связка upload → создание товара нерабочая, см. §2 |
| `POST /images/upload` → `PUT /categories/:slug` → `DELETE /images` | полный цикл работает, файл удаляется | картинки категорий готовы, трогать не нужно |

**Важный побочный вывод:** отсутствие JSON-обработчика 404 в `app.ts` оказалось полезным — «роута не существует» (404 + HTML) отличается от «запись не найдена» (404 + `{error}`). Фронт использует именно это, чтобы отличать «фича не реализована» от «товар не найден». Если будете добавлять глобальный JSON-404 — предупредите, сломается детект в `web/src/pages/admin/support.ts`.

### Заметка про локальное окружение

При поднятии стенда всплыло два расхождения с `main`, к коду отношения не имеют, но время съедают:

- `multer` объявлен в `package.json` (PR #30), но не установлен — `npm install`.
- Миграция `20260718165502_add_category_image` не применена к локальной БД → `GET /categories` отдаёт `500` (`Category.imageUrl does not exist`). Лечится `npx prisma migrate deploy`.

---

## Зафиксированные решения

- **Наличие:** флаг `isAvailable` на Product. Товар остаётся видимым в каталоге (фронт покажет «Немає в наявності»), но `POST /orders` с таким товаром отвечает 409.
- **Уборка старых:** физическое удаление невозможно для товаров с историей заказов (`OrderItem.product` стоит `onDelete: Restrict` — и это правильно, история заказов не должна ломаться). Поэтому **мягкое архивирование**: флаг `isArchived`. Архивный товар исчезает из всех публичных выдач полностью (в отличие от `isAvailable=false`).
- **Подтверждение/отклонение заказа:** бэкенд уже готов — `PUT /api/v1/orders/:id` со сменой статуса (переходы, идемпотентность, бонусы, защита от гонок реализованы). Кнопки: «Подтвердить» = `{status:"PROCESSING"}`, «Отклонить» = `{status:"CANCELLED"}`. На бэке менять ничего не нужно.
- **7 дней / архив:** не отдельные эндпоинты, а фильтры `from`/`to` + пагинация на существующем `GET /orders`. «7 дней» фронт задаёт сам (`from = now − 7d`), «архив за всё время» — тот же список без `from` с пагинацией.
- **Варианты (вкусы/объёмы):** CRUD-эндпоинтов нет вообще, варианты живут только в сиде. Для «изменения цены» нужны эндпоинты и по вариантам.
- **Кнопка «Виконано» (новое):** фронт добавил третью кнопку `{status:"COMPLETED"}` рядом с «Подтвердить»/«Отклонить». Без неё заказ невозможно закрыть из панели, а значит не начисляется 1% бонуса. Бэкенд этот переход уже поддерживает — доработок не требует.

---

---

## Сводка: что осталось сделать

| Метод/путь | Auth | Тело / query | Поведение | Где |
| --- | --- | --- | --- | --- |
| `PUT /products/:id` | admin | + `isAvailable?: boolean` | смена наличия и цены | §3.1 |
| `DELETE /products/:id` | admin | — | без заказов → `204`; с заказами → `isArchived = true`, `200 {archived:true}` | §3.2 |
| `GET /products*` (list, `:id`, related, popular) | публично | — | всегда `where isArchived: false`; `isAvailable` отдаётся в JSON | §3.3 |
| `GET /products?includeArchived=true` | admin | — | **решение не принято** — как админке видеть архив | §6.1 |
| `POST /products/:id/variants` | admin | `{taste?, size?, price}` | `201` | §5 |
| `PUT /products/:id/variants/:variantId` | admin | `{taste?, size?, price?}` | изменение цены варианта | §5 |
| `DELETE /products/:id/variants/:variantId` | admin | — | `204` | §5 |
| `POST /orders` | auth | — | недоступный товар → `409 {error, productIds}` | §4.1 |
| `GET /orders` | auth (как сейчас) | `?from&to&status&take&skip` | фильтр по `createdAt`, `take` ≤ 100 (default 50), ответ `{orders, total}` | §4.2 |
| `GET /customers?role=` | admin | — | список для управления админами | §7 |
| `PATCH /customers/:id/role` | admin | `{role}` | повышение/понижение | §7 |
| `PATCH /customers/:id/active` | admin | `{isActive}` | блокировка | §7 |

Плюс две правки схем, не меняющие контракт, но чинящие поведение: `imageUrl` (§2.1) и `.strict()` (§2.2).

---

## 1. Схема Prisma — миграция `add_admin_catalog` (аддитивная)

`server/prisma/schema.prisma`, `model Product` (строка 17) и `model Order` (строка 74):

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

Ожидаемый SQL — чисто аддитивный, без блокировок на переписывание таблицы (оба столбца с DEFAULT и NOT NULL, PostgreSQL 11+ добавляет их метаданными):

```sql
ALTER TABLE "Product" ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "isArchived"  BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Product_categoryId_isArchived_idx" ON "Product"("categoryId", "isArchived");
CREATE INDEX "Order_createdAt_idx"               ON "Order"("createdAt");
CREATE INDEX "Order_status_createdAt_idx"        ON "Order"("status", "createdAt");
```

Индексы на `Order` нужны под §5: без них фильтр по диапазону дат с пагинацией пойдёт seqscan'ом по всей таблице.

Сид: пометить 1–2 товара `isAvailable: false` для проверки фронта.

⚠️ `prisma/seed.cjs` начинается с `deleteMany()` по orderItem/order/customer/productVariant/product/category (строки 1706–1711) — это полный сброс БД, а не досев. На стенде с данными запускать нельзя.

---

## 2. Zod-схемы — `server/src/schemas/`

### 2.1. Баг `imageUrl` у товаров — чинить первым

`POST /api/v1/images/upload` возвращает локальный путь `/uploads/<uuid>.ext`, но `createProductSchema` (строка 22) и `updateProductSchema` (строка 31) требуют `z.url()`. Проверено: ответ `400 {"code":"invalid_format","format":"url","path":["imageUrl"]}`. **Создать или обновить товар с загруженной картинкой сейчас невозможно.** У категорий уже `z.string()` — поэтому там всё работает.

```ts
const imageUrlSchema = z.union([
  z.url(),
  z.string().regex(/^\/[\w\-./]+$/, "Image URL must be a valid URL or an /uploads path"),
]);
// createProductSchema.imageUrl: imageUrlSchema
// updateProductSchema.imageUrl: imageUrlSchema.optional()
```

Это одна строка, разблокирует всю связку upload → товар, и её стоит вынести отдельным маленьким PR вперёд остального.

### 2.2. `updateProductSchema` → `.strict()`

`updateProductSchema` — обычный `z.object`, поэтому неизвестные ключи **молча отбрасываются**. Проверено: `PUT /products/:id {"isAvailable":false}` отвечает `200 OK`, в теле ответа поля нет, товар не изменён.

Для UI это худший из возможных исходов: запрос «успешен», пользователь думает, что наличие переключилось, а в БД ничего не произошло. Сейчас фронт защищается тем, что проверяет наличие `isAvailable` в ответе и показывает предупреждение вместо ложного успеха, но правильное место для этой проверки — бэкенд:

```ts
export const updateProductSchema = z.object({ ... }).strict();
```

После этого неизвестное поле даст `400`, а не тихий no-op.

### 2.3. Новые схемы

- `schemas/products.ts`: `isAvailable: z.boolean().optional()` в `updateProductSchema`; схемы вариантов — `price` берёт существующий `priceSchema` (строка 5), `taste`/`size` строки, с `.refine()` на «хотя бы одно из полей задано».
- `schemas/orders.ts`: `listOrdersQuerySchema` — `from`/`to` ISO-datetime optional, `status` enum optional (переиспользовать существующий `orderStatusSchema`), `take` 1..100 default 50, `skip` ≥ 0 default 0. Плюс `.refine()` на `from <= to`, иначе получите пустую выдачу без объяснения.

---

## 3. Товары — `server/src/routes/products.ts`

### 3.1. `PUT /:id` (строка 113)

Пробросить `isAvailable` в `data`. Схема — §2.3, `.strict()` — §2.2.

### 3.2. `DELETE /:id` (строка 167) — заменить 409 на архивирование

Сейчас при `orderItems > 0` возвращается `409` (строки 187–192). Заменить на мягкое архивирование:

```ts
if (orderItems > 0) {
  await prisma.product.update({
    where: { id: parsed.data.id },
    data: { isArchived: true },
  });
  return res.status(200).json({ archived: true });
}
```

Физическое удаление для товаров без заказов остаётся как есть (`204`, варианты уходят каскадом). Фронт уже различает оба исхода: `204` → «удалён», `200 {archived:true}` → «заархивирован». Второй `409` в `catch` (строка 199, гонка) оставить — он отработает как fallback-сообщение.

### 3.3. Фильтр `isArchived: false` в публичных выдачах — 4 места

| Файл:строка | Хэндлер | Что делать |
| --- | --- | --- |
| `products.ts:43` | `getProducts` | добавить в `where` |
| `products.ts:64` | `getProductById` | архивный → `404` |
| `products.ts:230` | `getRelatedProducts` | добавить в `where` |
| `categories.ts:64` | `getCategoryPopularProduct` | архивный → `404`, а не `null` в теле |

Про `categories.ts:64` отдельно: там сначала `groupBy` по `orderItem`, потом `findUnique` по найденному `productId`. Если самый популярный товар категории заархивирован, `findUnique` с фильтром вернёт `null` и в ответ уйдёт `null` с кодом `200`. Нужно либо `404`, либо (лучше) исключать архивные ещё в `groupBy` через `where: { product: { categoryId, isArchived: false } }` — иначе категория останется без «популярного товара» вместо того, чтобы показать следующий по популярности.

---

## 4. Заказы — `server/src/routes/orders.ts`

### 4.1. Проверка доступности в `POST /` (строка 83)

`findMany` уже вытаскивает нужные товары, проверка добавляется сразу после существующей проверки количества (строка 86) — лишних запросов не будет:

```ts
const blocked = products.filter((p) => !p.isAvailable || p.isArchived);
if (blocked.length > 0) {
  throw httpError(409, "Products unavailable", { productIds: blocked.map((p) => p.id) });
}
```

Отдать `productIds` пока некуда: `lib/httpError.ts` — это `httpError(status, message)` и `Object.assign(new Error(message), { status })`, а `errorHandler` (`middleware/errorHandler.ts:19`) формирует тело строго как `{error: message}`. Нужны обе правки:

```ts
// lib/httpError.ts
export function httpError(status: number, message: string, payload?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, payload });
}

// middleware/errorHandler.ts:19 — payload только для 4xx, чтобы не протекли детали 5xx
const payload = status < 500 ? (err as { payload?: Record<string, unknown> }).payload : undefined;
res.status(status).json({ error: message, ...payload });
```

Без этого фронт покажет только общий текст «Products unavailable», но не сможет подсветить конкретные позиции корзины.

### 4.2. Фильтры и пагинация в `GET /` (строка 17)

Схема — §2.3. `where` собирается поверх существующего разделения ADMIN/CUSTOMER (его **не трогать** — это граница доступа):

```ts
const where = {
  ...(user.role === "ADMIN" ? {} : { customerId: user.id }),
  ...(from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
  ...(status && { status }),
};
const [orders, total] = await prisma.$transaction([
  prisma.order.findMany({ where, include: { ... }, orderBy: { createdAt: "desc" }, take, skip }),
  prisma.order.count({ where }),
]);
res.json({ orders, total });
```

`$transaction` здесь ради консистентности `total` со страницей — иначе при активном потоке заказов счётчик и выдача разъезжаются.

### 4.3. ⚠️ Смена формата ответа ломает личный кабинет

`GET /orders` сейчас отдаёт голый массив. Переход на `{orders, total}` — **breaking change не только для админки**:

`web/src/api/orders.ts` → `getMyOrders()` типизирован как `Promise<Order[]>` и используется в `useMyOrders` → `AccountPage`. В момент выкатки нового формата личный кабинет клиента покажет пустой список заказов, без ошибки — просто пусто.

Админский клиент (`web/src/api/admin.ts` → `getAdminOrders`) уже принимает **оба** формата и сам переключается с клиентской фильтрации на серверную. Клиентский — нет.

Варианты, любой рабочий, но выбрать нужно заранее:

1. **Сначала фронт** — сделать `getMyOrders` терпимым к обоим форматам, выкатить, потом менять бэкенд. Правка мелкая (та же нормализация, что в `getAdminOrders`), развязывает релизы.
2. **Одним PR** — бэкенд и фронт вместе.
3. **Не менять формат для клиента** — отдавать `{orders, total}` только когда в query есть пагинация, иначе массив. Обратно совместимо, но формат ответа начинает зависеть от запроса — так себе контракт, не рекомендую.

По умолчанию считаем выбранным вариант 1.

---

## 5. Варианты — новый CRUD

Роутов нет вообще (проверено: `404` + HTML). Все три под `requireAuth, requireAdmin`, регистрировать в `products.ts` рядом со строками 246–251.

| Метод/путь | Тело | Ответ |
| --- | --- | --- |
| `POST /products/:id/variants` | `{taste?, size?, price}` | `201` вариант |
| `PUT /products/:id/variants/:variantId` | `{taste?, size?, price?}` | `200` вариант |
| `DELETE /products/:id/variants/:variantId` | — | `204` |

Проверять, что `variantId` принадлежит `:id` из пути — иначе можно править вариант чужого товара, зная только его id. Несуществующий товар → `404` до валидации тела.

---

## 6. Решения, которые нужно принять до начала работы

Оба меняют то, что делает фронт, — не технические детали.

### 6.1. Как админке видеть архивные товары

В §3.3 архивные пропадают из **всех** выдач. Но панель товаров использует тот же `GET /products` — значит, заархивированный товар исчезнет и из админки тоже. Архивирование станет операцией без обратного хода через UI: разархивировать нельзя, потому что товара не видно.

В исходном плане этот случай не описан. Нужен админский обходной путь:

```ts
// GET /products?includeArchived=true — учитывается только для ADMIN,
// для всех остальных параметр игнорируется
const isAdmin = req.user?.role === "ADMIN";
const includeArchived = isAdmin && req.query.includeArchived === "true";
where: { ...(includeArchived ? {} : { isArchived: false }) }
```

Нюанс: `GET /products` сейчас публичный, `req.user` там не заполняется. Понадобится либо мягкий `optionalAuth` (парсит токен, если он есть, но не требует его), либо отдельный `GET /admin/products` под `requireAdmin`. Первое компактнее, второе честнее по границам доступа.

**Нужно от вас:** имя флага и выбранный подход. Фронт подключит за пару минут — сейчас вкладка товаров просто показывает всё, что вернул сервер.

### 6.2. Порядок выкатки `GET /orders`

См. §4.3 — выбрать вариант 1/2/3.

---

## 7. Управление админами

В плане этого не было, но дыра заметная: **создать или повысить админа через API нельзя вообще**.

- `POST /auth/web/register` (`auth.ts:66`) деструктурирует только `{name, email, password}`, `role` в Prisma имеет `@default(CUSTOMER)` (`schema.prisma:50`) — подсунуть роль в теле невозможно.
- `POST/PUT /customers` — в `createCustomerSchema`/`updateCustomerSchema` поля `role` нет, неизвестные ключи отбрасываются.

Сейчас единственные способы — `seed.cjs` (полный сброс БД, см. §1) или ручной `UPDATE "Customer" SET role='ADMIN'`. Это соответствует AGENTS.md («регистрации в админы нет»), но эксплуатировать неудобно.

Предложение — три эндпоинта под `requireAdmin`:

| Метод/путь | Тело | Поведение |
| --- | --- | --- |
| `GET /customers?role=&take=&skip=` | — | список для экрана управления |
| `PATCH /customers/:id/role` | `{role: "ADMIN" \| "CUSTOMER"}` | повышение/понижение |
| `PATCH /customers/:id/active` | `{isActive: boolean}` | блокировка |

Обязательные гарды:

1. **Себя нельзя** — `id === req.user.id` → `403`. Иначе админ разлогинит сам себя одним кликом.
2. **Последнего активного админа нельзя** понизить или заблокировать → `409`. Иначе система остаётся без единого админа и без API-пути обратно: чинить придётся руками в БД.
3. При понижении/блокировке — отозвать все refresh-токены пользователя (`refreshToken.updateMany`, механика уже есть в `lib/refreshTokens.ts`). `requireAdmin` ходит в БД на каждом запросе, так что доступ отвалится сразу, но живая сессия останется — лучше закрыть явно.

Побочная деталь про TTL: refresh у CUSTOMER живёт 30 дней, у ADMIN — 12 часов, и TTL фиксируется в момент выдачи. Повышенный до админа пользователь доработает текущую сессию со «клиентским» 30-дневным токеном. Не критично, но если хочется строго — п.3 решает и это.

---

## 8. Что уже готово и не трогаем

- **Категории (PR #30):** `POST /categories` `{name, slug, imageUrl?}` (slug обязателен, `^[a-z0-9-]+$`), `PUT /categories/:slug`, `DELETE /categories/:slug` — 409 для непустой; `Category.imageUrl String?` в схеме.
- **Картинки (PR #30):** `POST /api/v1/images/upload` (multipart `image`, jpeg/png, до 10 МБ) → `201 {url: "/uploads/<uuid>.ext"}`; `POST /images/replace` (`image` + `oldUrl` — удаляет старый файл); `DELETE /images` `{url}`. Всё admin-only, защита от path traversal, статика `/uploads` на бэке + vite-proxy на фронте, файлы вне git. Полный цикл перепроверен — работает.
- `PUT /orders/:id`: переходы `NEW → PROCESSING|COMPLETED|CANCELLED`, `PROCESSING → COMPLETED|CANCELLED`, терминальные заблокированы; идемпотентный повтор того же статуса; +1% бонуса при COMPLETED (кроме BONUS-оплаты); возврат бонусов при CANCELLED BONUS-заказа; защита от конкурентной смены.
- `DELETE /orders/:id` (отмена клиентом своего NEW) — не пересекается с админскими кнопками.
- Guard-механика `requireAuth`/`requireAdmin` с проверкой админа по БД.
- Разделение ADMIN/CUSTOMER в `getOrders`/`getOrderById` — граница доступа, при доработке фильтров не трогать.

---

## 9. Фронтенд: что уже написано и чем активируется

UI админки готов целиком (ветка `adminpan`) и вызывает в том числе ещё не существующие эндпоинты — деградирует явными плашками, а не ошибками. Бэкенд-правки включают функциональность **без изменений во фронте**, кроме §6.1.

| Файл | Назначение |
| --- | --- |
| `web/src/pages/admin/AdminPage.tsx` | каркас, вкладки, роут `/admin/:tab` |
| `web/src/pages/admin/OrdersTab.tsx` | подтвердить/отклонить/выполнить, фильтры 7д/30д/архив + статус, пагинация |
| `web/src/pages/admin/ProductsTab.tsx` | CRUD товаров, цены, переключатель наличия, поиск |
| `web/src/pages/admin/VariantsEditor.tsx` | цены вариантов, добавление/удаление |
| `web/src/pages/admin/CategoriesTab.tsx` | CRUD категорий, авто-slug |
| `web/src/pages/admin/ImageField.tsx` | загрузка файла или ручной URL + превью |
| `web/src/pages/admin/support.ts` | **детект нереализованных фич** |
| `web/src/components/RequireRole.tsx` | guard по роли |
| `web/src/api/admin.ts` | все админские вызовы, включая будущие |

Соответствие «правка на бэке → что включится»:

| Правка | Что произойдёт на фронте |
| --- | --- |
| §2.1 `imageUrl` | заработает загрузка картинок товаров (сейчас — явная плашка про этот баг) |
| §1 + §3.1 `isAvailable` | кнопка наличия начнёт реально переключать; пропадёт баннер «поля ещё нет» |
| §3.2 архивирование | `200 {archived:true}` покажет «Товар заархівовано» вместо ошибки |
| §4.2 `{orders, total}` | список заказов сам перейдёт на серверную фильтрацию и пагинацию |
| §5 варианты | редактор вариантов разблокируется (сейчас поля disabled + плашка) |
| §6.1 `includeArchived` | **требует правки во фронте** — подключить флаг |
| §7 управление админами | экрана пока нет, сделаю после утверждения контракта |

Детект «фича не реализована» живёт в `support.ts::isMissingEndpoint` — `404` **без** JSON-тела. См. предупреждение в §0.

---

## 10. Тесты

**Unit:** новые zod-схемы — варианты, `listOrdersQuerySchema` (границы `take` 1..100, дефолты, `from <= to`), ослабленный `imageUrl` (полный URL и `/uploads/...` проходят, мусор — нет), `.strict()` на `updateProductSchema` (неизвестный ключ → ошибка).

**Integration:**

- `PUT /products/:id {isAvailable:false}` → `POST /orders` с этим товаром → `409` + `productIds` в теле;
- архивирование товара с заказами → `200 {archived:true}` → товар исчез из `GET /products`, `GET /products/:id` → 404, `related`, `popular-product`;
- физическое удаление товара без заказов → `204`, варианты удалились каскадом;
- смена цены варианта; вариант чужого товара → `404`;
- `GET /orders?from&to` + пагинация: `total` не зависит от `take/skip`, `take=101` → `400`, `from > to` → `400`;
- **CUSTOMER не видит чужие заказы через новые фильтры** — регресс-тест на границу доступа из §4.2;
- создание товара с `imageUrl: "/uploads/..."`;
- `403` для CUSTOMER на всех новых админ-роутах;
- §7: админ не может понизить себя (`403`), последнего активного админа понизить нельзя (`409`).

Прогон: `npm run server:check`, `npm run server:test`, `npm run server:test:integration`.

---

## 11. Порядок реализации

Отсортировано по «разблокирует максимум при минимуме кода»:

1. **§2.1 `imageUrl`** — одна строка, чинит upload → товар. Отдельным маленьким PR.
2. **§2.2 `.strict()`** — убирает тихие no-op'ы, дальше отладка честнее.
3. Миграция §1 + сид (`isAvailable`, `isArchived`, индексы).
4. Zod-схемы §2.3.
5. Товары: `isAvailable` в PUT (§3.1), архивирование в DELETE (§3.2), фильтр `isArchived` (§3.3) — вместе с решением по §6.1.
6. Проверка доступности в `POST /orders` (§4.1) + payload в `httpError`.
7. Фильтры/пагинация `GET /orders` (§4.2) — по выбранному в §6.2 варианту.
8. Variants CRUD (§5).
9. Управление админами (§7) — после утверждения контракта.
10. Тесты §10, полный прогон.

Пункты 1–2 не зависят ни от чего и не ломают совместимость — их можно мерджить сразу.

---

## Известные пробелы (не в этом этапе)

- **Заказ не знает про вариант:** в `OrderItem` нет `variantId`, сумма считается по базовой `product.price`. Покупка конкретного вкуса/объёма по цене варианта — отдельный этап (поле `variantId String?` + цена из варианта в `createOrder`). После §5 это станет заметнее: цену варианта можно будет отредактировать, но на сумму заказа она по-прежнему не влияет.
- Наличие на уровне варианта (закончился только вкус «Манго») — при необходимости добавить `isAvailable` и на `ProductVariant`.
- Чистка осиротевших файлов в `uploads/` (картинка загружена, но товар так и не создан) — периодическая задача или сверка при старте, некритично. После §2.1 таких файлов станет меньше: сейчас каждая попытка создать товар с загруженной картинкой гарантированно оставляет сироту.
- **2FA (TOTP) для админов** — обязательна по ТЗ (AGENTS.md), поле `totpSecret` зарезервировано, реализации нет. Пока админ защищён только паролем — стоит держать в виду при появлении §7.
- Rate limiting на админских мутациях — follow-up.
