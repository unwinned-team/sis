# Авторизация Ice-Shop — ТЗ и план реализации

## Фронтенд: тот же фронтенд, но защищённые роуты

ice-shop.com/admin/\_ внутри того же React-приложения, что и клиентская часть, просто с проверкой роли (role === "ADMIN") через route guard.

```tsx
<Route
  path="/admin/_"
  element={
    <RequireRole role="ADMIN">
      <AdminLayout />
    </RequireRole>
  }
/>
```

Плюсы: один деплой, переиспользование компонентов/дизайн-системы, проще для маленькой команды/MVP.
Минусы: весь код админки (пусть даже лениво подгружаемый через React.lazy) потенциально доступен в том же origin, что и клиентская часть — чуть выше площадь атаки, плюс легче случайно "протечь" admin-функциональность в обычный UI по ошибке в роутинге.

---

# План реализации (backend)

## Зафиксированные решения

- **Идентификация:** только **Email + пароль**. Телефон — опциональное поле профиля, добавляется после оформления заказа (задел под будущий Google-вход по email, без дублей аккаунтов).
- **Токены:** JWT access (15 мин, jose, HS256) + одноразовый refresh с ротацией (непрозрачная случайная строка, в БД только sha256-хэш).
- **Пароли:** node:crypto scrypt, без bcrypt/argon2.
- **Транспорт:** web — refresh только в `HttpOnly; Secure; SameSite=Strict` cookie, access в памяти; mobile — оба токена в JSON (Keychain/Keystore). Никакого localStorage.
- **Пути:** API переезжает на префикс **`/api/v1`**. Разделение web/mobile — **только** для эндпоинтов, которые выдают/обновляют токены (`/auth/web/*`, `/auth/mobile/*`).
- **Роли:** CUSTOMER | ADMIN. Для админов stateless-доверие токену **запрещено** — проверка в БД на каждый админский запрос; refresh админа живёт 12 часов (у клиентов 30 дней).
- **2FA (TOTP) для админов:** обязательна по ТЗ, реализация **отложена на следующий этап**; в схеме заранее резервируется поле `totpSecret`.

## 1. Зависимости

В корневой `package.json`: `jose`, `cookie-parser`, dev `@types/cookie-parser`. Больше ничего.

## 2. Схема Prisma + миграция

`server/prisma/schema.prisma`:

```prisma
enum Role { CUSTOMER ADMIN }
enum TokenClient { WEB MOBILE }

model Customer {
  // ...существующие поля (email остаётся String? @unique — walk-in клиенты без аккаунта)...
  passwordHash  String?              // null = аккаунт без пароля (walk-in/seed), логин невозможен
  role          Role     @default(CUSTOMER)
  isActive      Boolean  @default(true)   // блокировка (критично для админов)
  totpSecret    String?              // резерв под 2FA, на этом этапе не используется
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id           String    @id @default(cuid())
  tokenHash    String    @unique      // sha256 сырого токена; сырой не храним
  customerId   String
  familyId     String                 // семья ротации = одна сессия/устройство
  client       TokenClient
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?
  createdAt    DateTime  @default(now())
  customer     Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
  @@index([customerId])
  @@index([familyId])
}
```

- Миграция аддитивная: `npx prisma migrate dev --name add_auth` (`db-migrations.yml` задеплоит).
- `seed.cjs`: upsert одного ADMIN (`admin@example.test`, пароль из `SEED_ADMIN_PASSWORD` с dev-дефолтом, хэш `scryptSync` в том же формате, что рантайм). Это единственный способ появления админа — регистрации в админы нет.
- **Защита от утечки хэша:** глобальный omit в `server/src/prisma.ts`:
  `new PrismaClient({ adapter, omit: { customer: { passwordHash: true, totpSecret: true } } })`.
  Логин переопределяет per-query (`omit: { passwordHash: false }`). Закрывает `include: { customer: true }` в orders и CRUD customers.

## 3. Дизайн токенов

- **Access:** JWT HS256 (jose), TTL 15 мин, payload минимальный — `sub` (customer id), `role`, `iat/exp`. Секрет `JWT_ACCESS_SECRET` (проверка ≥32 символов).
- **Refresh:** `crypto.randomBytes(32).toString("base64url")`, НЕ JWT — источник истины строка в БД. TTL: **CUSTOMER 30 дней, ADMIN 12 часов** (наступил новый день — админ логинится заново).

**Ротация + детект реплея** (внутри `prisma.$transaction`):

1. Поиск по `tokenHash`. Нет → 401.
2. Просрочен → 401.
3. `revokedAt != null` → **реплей «сгоревшего» токена = признак кражи**: по ТЗ отзываем **все** refresh-токены пользователя (`updateMany where customerId`) — выкидываем из системы на всех устройствах, требуем логин/пароль заново. Pino-warning (только customerId/familyId, без значений токенов) → 401.
4. Валиден → пометить `revokedAt`, создать преемника в той же семье, вернуть новый raw + id/role для нового access.

Login/register создают новую семью. Logout отзывает семью предъявленного токена.

**Cookie (web):** `httpOnly: true, sameSite: "strict", secure: NODE_ENV === "production"` (dev — HTTP), `path: "/api/v1/auth"` (не ездит с обычными запросами), `maxAge` = TTL refresh. `clearCookie` с теми же атрибутами.

## 4. Эндпоинты

Всё API переезжает на `/api/v1` (в `app.ts` роутер монтируется на `/api/v1`; во фронте обновить дефолт `VITE_API_URL`). Auth-роутер — `/api/v1/auth`:

| Метод/путь                   | Auth                              | Тело                      | Успех                                                         | Ошибки                                                                                                                                          |
| ---------------------------- | --------------------------------- | ------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/web/register`    | публичный                         | `{name, email, password}` | `201 {user, accessToken}` + refresh в Set-Cookie (авто-логин) | 400 zod; 409 дубликат email (P2002 в errorHandler)                                                                                              |
| `POST /auth/mobile/register` | публичный                         | то же                     | `201 {user, accessToken, refreshToken}`                       | то же                                                                                                                                           |
| `POST /auth/web/login`       | публичный                         | `{email, password}`       | `200 {user, accessToken}` + cookie                            | **единый** `401 {error: "Invalid credentials"}` (нет юзера / нет пароля / неверный пароль / isActive=false — один код-путь + DUMMY_HASH verify) |
| `POST /auth/mobile/login`    | публичный                         | то же                     | `200 {user, accessToken, refreshToken}`                       | то же                                                                                                                                           |
| `POST /auth/web/refresh`     | refresh из cookie                 | —                         | `200 {accessToken}` + ротированная cookie                     | 401 (реплей → отзыв всех токенов + clearCookie)                                                                                                 |
| `POST /auth/mobile/refresh`  | refresh из тела `{refreshToken}`  | —                         | `200 {accessToken, refreshToken}`                             | 401                                                                                                                                             |
| `POST /auth/logout`          | refresh (cookie или тело — общий) | —                         | `204`, cookie очищена, идемпотентно                           | —                                                                                                                                               |
| `GET /auth/me`               | `requireAuth`                     | —                         | `200` профиль (без passwordHash/totpSecret)                   | 401                                                                                                                                             |

Разделение web/mobile — только там, где выдаются/обновляются токены; `logout` и `me` общие. `user`: `{id, name, email, phone, role, bonusBalance, createdAt}`.

Общая внутренняя логика register/login/refresh — одна функция с параметром `client: WEB | MOBILE`; web/mobile-хэндлеры различаются только доставкой (cookie vs JSON), без дублирования бизнес-логики.

## 5. Новые файлы

| Файл                              | Ответственность                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/src/lib/password.ts`      | `hashPassword`/`verifyPassword`: async scrypt, N=32768, r=8, p=1, keylen=64, соль 16 байт, **`maxmem: 64*1024*1024`** (иначе scrypt бросает при таких N/r). Формат `scrypt$32768$8$1$<salt>$<hash>` — параметры парсятся при verify, можно поднимать без ломки старых хэшей. `timingSafeEqual`. Экспорт `DUMMY_HASH` для равномерного времени ответа на несуществующих юзерах. |
| `server/src/lib/jwt.ts`           | `signAccessToken({sub, role})` / `verifyAccessToken` через jose.                                                                                                                                                                                                                                                                                                               |
| `server/src/lib/refreshTokens.ts` | `issueRefreshToken(customerId, client, role)`, `rotateRefreshToken`, `revokeRefreshToken` — транзакционно, логика §3, TTL по роли.                                                                                                                                                                                                                                             |
| `server/src/lib/httpError.ts`     | Промоут локального `httpError` из `routes/orders.ts`.                                                                                                                                                                                                                                                                                                                          |
| `server/src/middleware/auth.ts`   | `requireAuth`: Bearer → verify → `req.user = {id, role}`, иначе 401 `{error: "Unauthorized"}` (stateless — ок для CUSTOMER). `requireAdmin`: после requireAuth делает **SELECT в БД** и проверяет `role === ADMIN && isActive` — токену не верим, уволенный/заблокированный админ отсекается сразу; иначе 403 `{error: "Forbidden"}`.                                          |
| `server/src/schemas/auth.ts`      | Zod-схемы: register (`name`, `email` (z.email), `password` ≥8), login (`email`, `password`).                                                                                                                                                                                                                                                                                   |
| `server/src/routes/auth.ts`       | Хэндлеры в стиле `orders.ts` (именованные async-функции + регистрации внизу), суб-роуты `web/`, `mobile/`.                                                                                                                                                                                                                                                                     |
| `server/src/types/express.d.ts`   | Заменить закомментированный стаб: `Request.user?: { id: string; role: Role }`.                                                                                                                                                                                                                                                                                                 |

## 6. Матрица защиты существующих маршрутов (breaking changes!)

| Маршрут                              | Стало                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET categories/products (чтение)     | публично (без изменений)                                                                                                                                                                   |
| POST/PUT/DELETE categories, products | `requireAuth, requireAdmin`                                                                                                                                                                |
| `GET /api/v1/orders`                 | auth; ADMIN — все, CUSTOMER — `where: {customerId: req.user.id}`                                                                                                                           |
| `GET /api/v1/orders/:id`             | auth; ADMIN или владелец; чужой → **404** (не 403 — не раскрывать существование id). Убрать `include: {customer: true}` → select.                                                          |
| `POST /api/v1/orders`                | auth; CUSTOMER: `customerId` берётся из токена (в теле игнорируется); ADMIN может передать `customerId` (заказ от имени клиента, POS-сценарий)                                             |
| `PUT /api/v1/orders/:id` (статус)    | `requireAdmin` (смена статусов + начисление 1% бонуса — back-office)                                                                                                                       |
| `DELETE /api/v1/orders/:id`          | auth; ADMIN или владелец (отмена своего NEW-заказа)                                                                                                                                        |
| `/api/v1/customers/*` целиком        | `router.use(requireAuth, requireAdmin)` — back-office; самообслуживание через `/api/v1/auth/me`. Телефон в профиль добавляется через будущий PATCH /auth/me (следующий этап) либо админом. |

## 7. Wiring

- `app.ts`: `cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173", credentials: true })`, `cookieParser()`, роутер на `/api/v1`.
- `routes/index.ts`: `router.use("/auth", authRouter)`.
- `.env.example`: `JWT_ACCESS_SECRET`, `CORS_ORIGIN`, `SEED_ADMIN_PASSWORD`.
- CI `db-migrations.yml`: `JWT_ACCESS_SECRET` в env интеграционного джоба.
- Чистка протухших RefreshToken: `deleteMany` при логине (без cron).
- Web: обновить дефолт `VITE_API_URL` на `http://localhost:4000/api/v1`.

## 8. Тесты

**Unit** (node:test): `schemas/auth.test.ts` (существующий glob), `lib/password.test.ts`, `lib/jwt.test.ts`. Расширить `server:test`: `--test "src/schemas/*.test.ts" "src/lib/*.test.ts"`.

**Интеграционные:** новый `server/src/auth.integration.test.ts` по образцу orders (app на порту 0, fetch, префиксная чистка): web-register (cookie есть, refresh в теле нет) / mobile-register (наоборот) → login → me → refresh ротирует (старый 401, новый работает) → реплей ротированного отзывает все токены пользователя → logout → 401; 401 без токена; 403 CUSTOMER на админ-роуте; **заблокированный (isActive=false) админ получает 403 даже с валидным токеном**; customer A не видит заказ B (404); список заказов — только свои. Cookie парсить из `set-cookie` вручную (undici не хранит cookies).

**Переработать `orders.integration.test.ts`** — сломается целиком: helper минта токенов (напрямую через `lib/jwt.ts` для setup), admin-вариант customer'а, `Authorization` в `api()`-хелпере, PUT — под админом, POST без `customerId`, пути `/api/v1/...`.

Расширить `server:test:integration`: `src/*.integration.test.ts`.

## 9. Порядок реализации

1. Установить `jose`, `cookie-parser`, `@types/cookie-parser`.
2. Схема + миграция + глобальный `omit` в `prisma.ts` + admin в `seed.cjs`.
3. `lib/password.ts`, `lib/jwt.ts`, `lib/httpError.ts` + unit-тесты. ✅ `server:test`, `server:check`.
4. `types/express.d.ts` + `middleware/auth.ts` (requireAuth, requireAdmin с DB-проверкой).
5. `lib/refreshTokens.ts` (TTL по роли, отзыв всех токенов при реплее).
6. `schemas/auth.ts` + `routes/auth.ts` (web/mobile суб-роуты) + wiring (`app.ts`: cors/cookie-parser/`/api/v1`, `.env.example`).
7. Матрица §6 на существующие роуты; убрать `include: {customer: true}`; `customerId` опционален в `createOrderSchema`.
8. `auth.integration.test.ts` + переработка orders-интеграционных + glob + CI env + `VITE_API_URL`.
9. Финальный прогон: `server:check`, `server:test`, `server:test:integration` с локальной `TEST_DATABASE_URL`.

## Верификация

- `npm run server:check`, `npm run server:test`, `npm run server:test:integration`.
- Ручной smoke: `curl` web-register → Set-Cookie в ответе и нет refresh в теле; login → access; `GET /api/v1/auth/me` с Bearer; refresh по cookie; повтор старого refresh → 401 и отзыв всех токенов; `GET /api/v1/orders` без токена → 401; блокировка админа (`isActive=false` в БД) → 403 на админ-роуте с живым access-токеном.

## Риски / следующие этапы

- **`SameSite=Strict` в проде:** cookie не уходит на cross-site запросы. Dev ок (localhost:5173 → localhost:4000 — same-site, порт не важен). В проде web и API должны жить на одном домене (reverse proxy), иначе ослаблять до Lax.
- **Breaking API:** переезд на `/api/v1` + auth ломают текущий фронтенд-флоу заказов до фронтенд-доработки (`Authorization`-заголовок, `credentials: "include"` на auth-запросах, retry на 401 через refresh). Витрина (категории/товары) продолжит работать после смены base URL.
- **Следующий этап (обязателен по ТЗ): 2FA TOTP для админов** — setup + QR + проверка кода при логине админа; поле `totpSecret` уже в схеме.
- Rate limiting на login/register/refresh (`express-rate-limit`) — follow-up.
- PATCH `/auth/me` (добавление телефона после заказа, смена пароля) — следующий этап.
- Seed-клиенты и walk-in клиенты без пароля логиниться не смогут (ок для dev-стадии; «set password / invite» — вне скоупа).
