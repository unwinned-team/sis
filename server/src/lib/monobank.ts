import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

const API_BASE = "https://api.monobank.ua";
const MAX_STATEMENT_INTERVAL_MS = 31 * 24 * 60 * 60 * 1000;
// Зависший запрос иначе блокировал бы tick воркера навсегда: следующий tick
// планируется только после завершения текущего (цепочка setTimeout).
const FETCH_TIMEOUT_MS = 10_000;

// Поля выписки, которые использует матчинг; остальное monobank шлёт, но нам не нужно.
export interface StatementItem {
  id: string;
  time: number; // unix seconds
  description?: string | undefined;
  comment?: string | undefined;
  amount: number; // копейки; приход > 0, расход < 0
}

function token(): string {
  const t = process.env.MONOBANK_TOKEN;
  if (!t) throw new Error("MONOBANK_TOKEN is not set");
  return t;
}

// Регистрация webhook: monobank сразу шлёт GET на url и ждёт 200.
// Лимит /personal/ общий на токен — вызывается один раз при старте,
// первый statement-pull воркера отложен на tick, чтобы не пересечься.
export async function setWebhook(webHookUrl: string): Promise<void> {
  const res = await fetch(`${API_BASE}/personal/webhook`, {
    method: "POST",
    headers: { "X-Token": token(), "Content-Type": "application/json" },
    body: JSON.stringify({ webHookUrl }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`monobank setWebhook: ${res.status} ${await res.text()}`);
  }
}

// Лимит monobank: 1 запрос / 60 сек — единственный вызов делает воркер (1 pull за tick).
// ponytail: без пагинации — monobank отдаёт до 500 транзакций за окно; окно
// у нас ~35 мин, при переполнении добавить постранично по item.time.
export function clampStatementFrom(from: Date, now = Date.now()): Date {
  return new Date(Math.max(from.getTime(), now - MAX_STATEMENT_INTERVAL_MS));
}

export async function fetchStatement(from: Date): Promise<StatementItem[]> {
  const account = process.env.MONOBANK_ACCOUNT || "0";
  // Monobank rejects intervals longer than 31 days + 1 hour. Keep a small
  // safety margin so one old order cannot block verification for all others.
  const fromSec = Math.floor(clampStatementFrom(from).getTime() / 1000);
  const res = await fetch(`${API_BASE}/personal/statement/${account}/${fromSec}`, {
    headers: { "X-Token": token() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`monobank statement: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StatementItem[];
}

// Реф вводится плательщиком вручную в комментарий перевода — короткий, верхний регистр.
// ponytail: 32 бита случайности, ~1% шанс коллизии unique-индекса на 10k заказов
// (создание заказа тогда упадёт 500, повторная попытка пройдёт); при росте — 6 байт.
export function generatePaymentRef(): string {
  return `ICE-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// Реф из комментария (webhook или выписка); плательщики дописывают лишний текст.
export function extractPaymentRef(comment: string): string | null {
  const m = comment.toUpperCase().match(/ICE-[0-9A-F]{8}/);
  return m ? m[0] : null;
}

// Ссылка send.monobank.ua с предзаполнением: ?a= сумма, &t= комментарий.
// Параметры недокументированы; если monobank их уберёт, ссылка откроется с
// пустыми полями — клиент вводит сумму/реф руками, матчинг не пострадает.
export function buildPaymentUrl(
  paymentRef: string,
  paymentAmount: Prisma.Decimal,
): string {
  const base = process.env.MONOBANK_SEND_URL;
  if (!base) throw new Error("MONOBANK_SEND_URL is not set");
  return `${base}?a=${paymentAmount.toFixed(2)}&t=${encodeURIComponent(paymentRef)}`;
}

// Запас на расхождение часов сервера и банка при сравнении item.time с createdAt.
const CLOCK_SKEW_MS = 60_000;

// Двойной матч: приход (amount > 0) с суммой ровно paymentAmount (копейки,
// с «хвостом» — уникальна среди активных заказов). Реф: пустой комментарий
// допустим (перевод из другого банка), но чужой ICE-код отвергается — это
// платёж другого заказа, случайно совпавший суммой. Транзакции старше
// createdAt заказа не матчатся: выписка покрывает всю очередь (до 31 дня),
// и после освобождения paymentAmountKey старый перевод без комментария
// иначе подтвердил бы новый заказ с той же суммой.
export function matchPayment(
  items: StatementItem[],
  paymentRef: string,
  paymentAmount: Prisma.Decimal,
  createdAt: Date,
): boolean {
  const kopecks = paymentAmount.mul(100).toNumber();
  const notBeforeMs = createdAt.getTime() - CLOCK_SKEW_MS;
  return items.some((item) => {
    if (item.time * 1000 < notBeforeMs) return false;
    if (item.amount <= 0 || item.amount !== kopecks) return false;
    const ref = extractPaymentRef(item.comment ?? "");
    return ref === null || ref === paymentRef;
  });
}
