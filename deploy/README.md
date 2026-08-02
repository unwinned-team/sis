# Деплой: pm2 + nginx на одном VPS

Фронтенд и API живут на одном домене. Так refresh-cookie (`sameSite: "strict"`)
работает без правок в коде, а `uploads/` лежит на обычном диске — объектное
хранилище не нужно.

Ниже `example.com` — ваш домен, `/srv/ice-shop` — путь к репозиторию.
Оба встречаются в `deploy/nginx.conf` и `deploy/proxy.conf`.

---

## 1. Разовая подготовка сервера

```bash
sudo apt update
sudo apt install -y nginx postgresql certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### База

Расширение `pg_trgm` обязательно — на нём держится поиск по товарам
(GIN-индексы в `schema.prisma`). Без него `prisma migrate deploy` упадёт.

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE ice_shop;
CREATE USER ice_shop_app WITH PASSWORD 'ЗАМЕНИТЕ_МЕНЯ';
GRANT ALL PRIVILEGES ON DATABASE ice_shop TO ice_shop_app;
\c ice_shop
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT ALL ON SCHEMA public TO ice_shop_app;
SQL
```

---

## 2. Код и переменные окружения

```bash
sudo mkdir -p /srv/ice-shop && sudo chown "$USER" /srv/ice-shop
git clone <repo> /srv/ice-shop
cd /srv/ice-shop
npm ci
```

`server/.env` (за образец — `server/.env.example`):

```ini
DATABASE_URL="postgresql://ice_shop_app:ПАРОЛЬ@localhost:5432/ice_shop"
PORT=4000
NODE_ENV="production"
LOG_LEVEL="info"

# 32+ случайных символа: openssl rand -base64 48
JWT_ACCESS_SECRET="..."

# Точный публичный origin.
CORS_ORIGIN="https://example.com"

# nginx = один прокси-хоп. При 0 req.ip станет 127.0.0.1,
# и в AgeVerification попадёт адрес прокси вместо покупателя.
TRUST_PROXY_HOPS=1

SEED_ADMIN_PASSWORD="..."

# Пусто — заказы CARD создаются, но автоподтверждение выключено.
MONOBANK_TOKEN=""
MONOBANK_ACCOUNT="0"
MONOBANK_WEBHOOK_URL="https://example.com/api/v1/payments/webhook"
MONOBANK_SEND_URL=""
MONOBANK_PAYMENT_DETAILS=""
```

```bash
chmod 600 server/.env
```

`NODE_ENV=production` — не косметика: именно он включает флаг `secure`
у refresh-cookie (`server/src/routes/auth.ts:31`).

---

## 3. Миграции и первичное наполнение

```bash
npm run server:deploy     # prisma migrate deploy
```

> **Сид стирает базу.** `seed.cjs` начинается с `deleteMany()` по заказам,
> покупателям, товарам и категориям. Запускается **один раз** на пустой базе.
> После запуска магазина новые товары добавляются только через админку —
> повторный `server:db:seed` снесёт живые заказы.

```bash
npm run server:db:seed    # ТОЛЬКО на первом деплое
```

---

## 4. Сборка

```bash
# Относительный путь: фронт и API на одном origin, поэтому CORS не участвует.
VITE_API_URL=/api/v1 npm run web:build
npm run server:build
```

`VITE_API_URL` вшивается в бандл на этапе сборки (`web/src/api/client.ts:1`),
менять её в рантайме нельзя — только пересборкой.

---

## 5. pm2

```bash
cd /srv/ice-shop
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup        # выполнить выведенную команду через sudo
```

`cwd` в `ecosystem.config.cjs` указывает на `server/` и менять его нельзя:
от `process.cwd()` зависят поиск `.env`, каталог загрузок у multer,
`path.resolve("uploads")` при удалении и `express.static("uploads")`.
Из корня репозитория сервер даже не стартует — не найдёт `DATABASE_URL`.

Только один инстанс (`instances: 1`, `exec_mode: "fork"`): в cluster mode
каждый форк поднимет свой `startPaymentVerifier()`, а выписка monobank
лимитирована 1 запросом в 60 секунд на токен.

---

## 6. nginx + TLS

```bash
mkdir -p /srv/ice-shop/logs
sudo cp deploy/nginx.conf /etc/nginx/sites-available/ice-shop
sudo ln -s /etc/nginx/sites-available/ice-shop /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# nginx должен читать статику и загруженные фото
sudo chmod o+x /srv /srv/ice-shop /srv/ice-shop/server
sudo chmod -R o+rX /srv/ice-shop/web/dist /srv/ice-shop/server/uploads

sudo nginx -t          # обязательно до reload
sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d www.example.com
```

`client_max_body_size 10m` в конфиге — не украшение: multer принимает файлы
до 10 МБ, дефолт nginx 1 МБ, и фото между 1 и 10 МБ отвалилось бы с 413
ещё до Node.

---

## 7. Проверка после деплоя

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://example.com/            # 200
curl -s -o /dev/null -w "%{http_code}\n" https://example.com/api/v1/categories  # 200
curl -s -o /dev/null -w "%{http_code}\n" https://example.com/category/tobacco   # 200 (SPA fallback)
pm2 logs ice-shop-api --lines 30
```

Затем руками в админке: залить фото, создать товар, добавить ему смак,
проверить, что товар и фото видны на витрине.

---

## Обновление

```bash
cd /srv/ice-shop
git pull
npm ci
npm run server:deploy            # prisma migrate deploy
npm run server:db:update-catalog # новые варианты + заполнение пустых полей
VITE_API_URL=/api/v1 npm run web:build
npm run server:build
pm2 reload ice-shop-api
```

Сид **не запускать**: он начинается с `deleteMany()` и снесёт живые заказы.

`server:db:update-catalog` — безопасная альтернатива сиду: добавляет недостающие
варианты из `server/prisma/catalog.cjs`, ничего не удаляя (кроме явного списка
`removedVariants`). Повторный запуск ничего не меняет.

Всё, что уже заполнено, он **не трогает** — ни фото, ни описание варианта, ни
описание товара, ни название категории. Каталог только дополняет пустое, чтобы
не затереть правки из админки. База — источник правды для текстов; чтобы
выгрузить их обратно в репозиторий, есть `node prisma/dump-descriptions.cjs`.

Если каталог в репозитории должен победить — запускать с флагом. **Он перезапишет
тексты, написанные админами**, так что сначала бэкап:

```bash
npm run server:db:update-catalog -- --overwrite-text
```

Порядок важен: `server:deploy` до `update-catalog` (скрипт пишет в колонки,
которых без миграции ещё нет), а `web:build` — после `git pull`, иначе новые
фото каталога из `web/public/images/products/` не попадут в бандл.

---

## Что где живёт

| Что | Где | Меняется |
|---|---|---|
| Фото из админки | `server/uploads/` на диске | сразу, без пересборки |
| Фото каталога | `web/public/images/products/` | только пересборкой + деплоем |
| Товары, категории, смаки | БД | сразу через админку |

Каталожные фото попадают в бандл на сборке, поэтому связка
`table.csv` + файлы в `web/public` — процесс времени сборки, а не рантайма.

`server/uploads/` не в git и не переживёт пересоздание сервера — включите
каталог в бэкап вместе с дампом БД.
