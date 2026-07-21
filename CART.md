# Here is Claude's plan:

# Корзина (серверная) для Ice-Shop

## Контекст

В магазине нет корзины: на странице товара висит задизейбленная кнопка «🛒 Додати в кошик» (`web/src/pages/ProductPage.tsx:107-117`), а заказы создаются только одним запросом `POST /api/v1/orders`. Решения пользователя:

- Хранение на сервере (Prisma/Postgres + REST API `/api/v1/cart`). Гостевого identity в проекте нет, поэтому корзина доступна только авторизованным; гостю UI предлагает войти.
- С поддержкой вариантов (`ProductVariant`: вкус/размер со своей ценой) — позиция корзины = товар + опциональный вариант + количество.
- Checkout вне объёма задачи: кнопка «Оформити замовлення» на странице корзины остаётся неактивной («незабаром»). Order/OrderItem не трогаем.

Стек: Express 5 + Prisma 7 + zod v4 (server), React 19 + Vite + Tailwind 4 (web). Следовать существующим паттернам: обработчики как в `server/src/routes/orders.ts` (safeParse → 400, try/catch → next, httpError, нарушение владения → 404, а не 403), контекст как `web/src/context/AuthProvider.tsx`.

## Ключевые решения

1.  Модель — одна таблица `CartItem`, неявная «одна корзина на покупателя», без родительской `Cart`. Дедупликация строк без варианта: Postgres считает NULL-ы в unique-индексе различными, поэтому добавляем денормализованную колонку `variantKey String @default("")` (= `variantId ?? ""`) и `@@unique([customerId, productId, variantKey])` — это даёт честную БД-гарантию и атомарный upsert.
2.  FK — Cascade на все три связи (customerId, productId, variantId). Удалённый вариант/товар молча убирает строки корзины; заархивированный/недоступный товар — строку оставляем и помечаем `isAvailable: false`, исключая из итогов (ADMIN.md как раз закладывал подсветку недоступных позиций).
3.  Каждый эндпоинт возвращает полную корзину (200 + канонический JSON) — фронтенд просто делает `setCart(response)`, без оптимистичных обновлений.
4.  POST инкрементирует количество существующей строки, PATCH задаёт. Лимиты: количество ≤ 999 (`MAX_CART_ITEM_QUANTITY`, зод + клэмп после upsert), различных строк ≤ 100 (`MAX_CART_LINES` → 409 "Cart is full"). Вариант чужого товара → 404 (scoped `findFirst({id, productId})`); товар с вариантами без `variantId` → 400. ADMIN тоже имеет корзину (достаточно `requireAuth`).

## Бэкенд

### 1. `server/prisma/schema.prisma` — модель + обратные связи (`cartItems CartItem[]` у Customer, Product, ProductVariant)

```prisma
model CartItem {
  id         String @id @default(cuid())
  customerId String
  productId  String
  variantId  String?
  // Всегда variantId ?? "": NULL-ы в unique различимы, дедуп идёт через этот ключ
  variantKey String @default("")
  quantity   Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  customer Customer          @relation(fields: [customerId], references: [id], onDelete: Cascade)
  product  Product           @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant  ProductVariant?   @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([customerId, productId, variantKey])
  @@index([customerId])
  @@index([productId])
  @@index([variantId])
}
```

Миграция: `npm run server:db:migrate -- --name add_cart`, затем `npm run server:check`. seed.cjs не меняем (wipe чистит корзины каскадом).

### 2. Новый `server/src/schemas/cart.ts`

`MAX_CART_ITEM_QUANTITY = 999`, `MAX_CART_LINES = 100`; `addCartItemSchema` (`{productId, variantId?, quantity?}`, quantity int positive ≤999 default 1, `.strict()`), `updateCartItemSchema` (`{quantity}`, `.strict()`), `cartItemParamsSchema`. Стиль — как `server/src/schemas/orders.ts`.

### 3. Новый `server/src/routes/cart.ts`

```ts
router.get("/", requireAuth, getCart);
router.post("/items", requireAuth, addCartItem);
router.patch("/items/:id", requireAuth, updateCartItem);
router.delete("/items/:id", requireAuth, removeCartItem);
router.delete("/", requireAuth, clearCart);
```

Общий сериализатор `loadCart(db, customerId)` (принимает prisma или tx): `findMany` с `include: {product: {include: {category: true}}, variant: true}`, `orderBy: {createdAt: "asc"}`. Ответ (Decimal → строки `.toFixed(2)`, как везде в API):

```json
{
  "items": [{
    "id", "productId", "variantId|null", "quantity",
    "unitPrice": "129.00", // variant?.price ?? product.price
    "lineTotal": "258.00",
    "isAvailable": true, // product.isAvailable && !product.isArchived
    "product": {...}, "variant": {...}|null
  }],
  "totalQuantity": 3, // только доступные строки
  "totalAmount": "397.00" // только доступные строки
}
```

`addCartItem` внутри `prisma.$transaction`:

1.  товар не найден → 404; недоступен/архив → 409 "Products unavailable" + `err.details = {productIds:[id]}` (errorHandler уже сериализует details);
2.  `variantId` есть → `findFirst({id: variantId, productId})`, иначе 404; нет, но у товара есть варианты → 400;
3.  если строка новая и `count(customerId) >= 100` → 409 "Cart is full";
4.  upsert по `customerId_productId_variantKey` с `quantity: {increment}`;
5.  клэмп `updateMany(... quantity > 999 → 999)`;
6.  вернуть `loadCart(tx, ...)`. В catch: Prisma P2003 → 404 "Customer not found" (паттерн orders.ts:169-171).

`updateCartItem`/`removeCartItem`: `updateMany`/`deleteMany({id, customerId})`, count === 0 → 404 (закрывает и чужие строки без утечки существования). `clearCart`: `deleteMany({customerId})` → 200 с пустой корзиной, идемпотентно. `getCart` — просто `loadCart`.

### 4. `server/src/routes/index.ts` — `router.use("/cart", cartRouter)`

## Фронтенд

### 5. Новый `web/src/types/cart.ts` (+ реэкспорт из `types/index.ts`)

`CartItem {id, productId, variantId|null, quantity, unitPrice, lineTotal, isAvailable, product, variant|null}`, `Cart {items, totalQuantity, totalAmount}` (цены — строки, как в `types/product.ts`).

### 6. Новый `web/src/api/cart.ts`

Пять обёрток над `apiRequest<Cart>` из `web/src/api/client.ts`, все принимают `accessToken` и возвращают `Cart`: `getCart`, `addCartItem`, `updateCartItem`, `removeCartItem`, `clearCart`.

### 7. Новые `web/src/context/cart-context.ts` + `CartProvider.tsx` + `web/src/hooks/useCart.ts`

Зеркально трио auth (`AuthProvider.tsx` / `auth-context.ts` / `useAuth.ts` — useCart кидает ошибку вне провайдера). Провайдер читает `useAuth()`; эффект на `[accessToken, user?.id, reloadKey]` с флагом cancelled (паттерн `useMyOrders.ts`): токен есть → `getCart`, юзера нет → `setCart(null)`. Мутации: `await api` → `setCart(response)`, ошибки пробрасываются (страницы показывают `apiErrorText`). Экспорт `itemCount = cart?.totalQuantity ?? 0`.

### 8. `web/src/App.tsx`

`<CartProvider>` сразу внутри `<AuthProvider>`; новый маршрут `/cart` → `CartPage` (eager).

### 9. Новый `web/src/pages/CartPage.tsx`

Шаблон страницы (BackgroundOrbs + Header + main `mx-auto max-w-6xl ...` + BackButton), украинский текст, liquid-glass классы как в `AccountPage.tsx`. Состояния: скелетон → гость («Увійдіть, щоб користуватися кошиком» + ссылки на `/auth`, `/auth?mode=register`) → пустая корзина → список. Строка: картинка, имя-ссылка на `/product/:id`, чипы вкуса/размера, `formatPrice(unitPrice)`, степпер количества (− заблокирован на 1, + на 999, локальный `busyItemId` блокирует кнопки на время мутации), `lineTotal`, удалить. Недоступные строки — янтарная рамка + «Товар недоступний», «не враховується в сумі». Футер: «Разом: {totalAmount}», «Очистити кошик», задизейбленная «Оформити замовлення» с подписью «Оформлення замовлення з'явиться незабаром».

### 10. `web/src/pages/ProductPage.tsx` (строки 107-117)

В ProductDetails: `useAuth`, `useCart`, `useNavigate`; статус `'idle'|'adding'|'added'` + ошибка. Кнопка активна (disabled только пока `adding` или когда `variants.length > 0 && !selectedVariant`). Клик: гость → `navigate('/auth')`; иначе `addItem({productId, variantId: selectedVariant?.id, quantity: 1})`, флеш «✓ Додано» ~2с + ссылка «До кошика →». Убрать постоянную подпись «Кошик з'явиться незабаром»; гостю — подсказка «Увійдіть, щоб додати в кошик».

### 11. `web/src/components/Header.tsx`

Пустой левый `<span aria-hidden>` в сетке `grid-cols-[40px_1fr_40px]` → `Link to="/cart"` с иконкой корзины (`aria-label="Кошик"`) и бейджем количества (`itemCount > 0`). `ProductCard.tsx` и `SideMenu.tsx` не трогаем («Купити» остаётся ссылкой — выбор варианта происходит на странице товара).

## Тесты

### 12. Новый `server/tests/unit/schemas/cart.test.ts`

По образцу `tests/unit/schemas/orders.test.ts`: дефолт `quantity=1`; отказ на 0/-1/1.5/1000; пустые `productId`/`variantId`; strict-отказ лишних ключей; то же для `update`.

### 13. Новый `server/tests/integration/cart.integration.test.ts`

Скопировать каркас `orders.integration.test.ts` (app на порту 0, `api()`-хелпер, префикс `it-${randomUUID()}`, токены через `signAccessToken`, cleanup по префиксу в `afterEach` — cartItem чистить явно перед customer/product). Кейсы: 401 без токена на всех пяти; пустая корзина `{items:[], totalQuantity:0, totalAmount:"0.00"}`; добавление; повторный POST того же товара без варианта → одна строка, количество суммируется (гарантия `variantKey`); два варианта → две строки с ценами вариантов, повторный вариант A инкрементит только A; чужой `variantId` → 404; товар с вариантами без `variantId` → 400; архивный товар → 409 + `details.productIds`; клэмп 999; PATCH задаёт количество, PATCH/DELETE чужой строки → 404 (изоляция вторым пользователем); DELETE /cart идемпотентен; после `isArchived: true` строка помечена `isAvailable:false` и исключена из итогов; после удаления варианта строка исчезает каскадом.

Веб-тестов нет и не заводим (харнеса нет) — только lint/build + ручная проверка.

## Проверка

1.  `npm run server:db:migrate -- --name add_cart` → `npm run server:check`
2.  `npm run server:test` и `npm run server:test:integration`
3.  `npm run web:lint` и `npm run web:build`
4.  Вручную через `npm run dev`: гость → кнопка ведёт на `/auth`; логин → добавить товар без варианта и с вариантом → бейдж в шапке обновляется → `/cart`: степперы/удаление/очистка, «Оформити» неактивна → в `/admin` заархивировать товар → строка подсвечена и исключена из суммы → logout: бейдж пропал, `/cart` показывает приглашение войти.

## Вне объёма (для будущей задачи checkout)

`OrderItem` без `variantId` + `@@unique([orderId, productId])`; `createOrderSchema` принимает только `productId+quantity`. Для checkout понадобится миграция `OrderItem` (`variantId`/`variantKey`), вариантный расчёт цены в `POST /orders`, поток «создать заказ из корзины и очистить её» и активация кнопки «Оформити замовлення».
