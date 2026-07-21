import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminOrders, setOrderStatus } from '../../api/admin';
import { formatPrice } from '../../utils/format';
import { saveErrorMessage } from './support';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  Notice,
  Skeleton,
} from './ui';
import type { Order, OrderStatus } from '../../types';

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новий',
  PROCESSING: 'В обробці',
  COMPLETED: 'Виконано',
  CANCELLED: 'Скасовано',
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  NEW: 'bg-sky-100 text-sky-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-teal-100 text-teal-700',
  CANCELLED: 'bg-slate-200 text-slate-500',
};

const PAGE_SIZE = 20;

type RangePreset = '7d' | '30d' | 'all' | 'custom';

interface LoadedOrders {
  key: string;
  orders: Order[];
  total: number;
  serverFiltered: boolean;
  error: string | null;
}

const RANGE_LABELS: Record<RangePreset, string> = {
  '7d': '7 днів',
  '30d': '30 днів',
  all: 'Весь архів',
  custom: 'Свій період',
};

function presetFrom(preset: RangePreset): string | undefined {
  if (preset === 'all' || preset === 'custom') return undefined;
  const days = preset === '7d' ? 7 : 30;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function OrderRow({
  order,
  onChangeStatus,
  pendingStatus,
}: {
  order: Order;
  onChangeStatus: (id: string, status: OrderStatus) => void;
  pendingStatus: OrderStatus | null;
}) {
  const isBusy = pendingStatus !== null;
  const isOpen = order.status === 'NEW' || order.status === 'PROCESSING';

  return (
    <article className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {order.customer?.name ?? 'Клієнт'}
            {order.customer?.phone && (
              <span className="font-normal text-slate-500"> · {order.customer.phone}</span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {formatDateTime(order.createdAt)} · {order.paymentMethod} · #{order.id.slice(-6)}
          </p>
          {order.shippingAddress && (
            <p className="mt-1 text-xs text-slate-600">
              📦 НП: {order.shippingAddress.city}, {order.shippingAddress.oblast} обл., від.{' '}
              {order.shippingAddress.branch}
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[order.status]}`}
        >
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700">
              {item.product?.name ?? 'Товар'}
              <span className="text-slate-400"> × {item.quantity}</span>
            </span>
            <span className="whitespace-nowrap font-medium text-slate-600">
              {formatPrice(item.price)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/50 pt-3">
        <p className="text-sm text-slate-500">
          Разом:{' '}
          <span className="text-base font-bold text-slate-900">
            {formatPrice(order.totalAmount)}
          </span>
        </p>

        {isOpen && (
          <div className="flex flex-wrap gap-2">
            {order.status === 'NEW' && (
              <button
                type="button"
                onClick={() => onChangeStatus(order.id, 'PROCESSING')}
                disabled={isBusy}
                className="rounded-full bg-[#aee6df] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#14403c] shadow-sm transition hover:bg-[#9adfd7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingStatus === 'PROCESSING' ? 'Зачекайте...' : 'Підтвердити'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onChangeStatus(order.id, 'COMPLETED')}
              disabled={isBusy}
              className="rounded-full border border-teal-200 bg-teal-50/80 px-4 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingStatus === 'COMPLETED' ? 'Зачекайте...' : 'Виконано'}
            </button>
            <button
              type="button"
              onClick={() => onChangeStatus(order.id, 'CANCELLED')}
              disabled={isBusy}
              className={DANGER_BUTTON_CLASS}
            >
              {pendingStatus === 'CANCELLED' ? 'Зачекайте...' : 'Відхилити'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function OrdersTab({ accessToken }: { accessToken: string }) {
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(0);

  const [loaded, setLoaded] = useState<LoadedOrders | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; status: OrderStatus } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // presetFrom() берёт new Date(), поэтому без useMemo граница периода менялась
  // бы на каждый рендер: requestKey никогда не совпал бы с loaded.key, скелет
  // не исчезал бы, а эффект уходил в бесконечный цикл запросов к /orders.
  const from = useMemo(
    () =>
      preset === 'custom'
        ? customFrom
          ? new Date(customFrom).toISOString()
          : undefined
        : presetFrom(preset),
    [preset, customFrom],
  );
  const to = preset === 'custom' && customTo ? new Date(customTo).toISOString() : undefined;

  const requestKey = JSON.stringify({ from, to, status, page, reloadKey });
  const isLoading = loaded?.key !== requestKey;

  const serverFiltered = loaded?.serverFiltered ?? true;
  const error = loaded?.error ?? null;

  function changeFilter(apply: () => void) {
    apply();
    setPage(0);
  }

  useEffect(() => {
    let cancelled = false;

    getAdminOrders(accessToken, {
      from,
      to,
      status: status === '' ? undefined : status,
      take: PAGE_SIZE,
      skip: page * PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setLoaded({
          key: requestKey,
          orders: result.orders,
          total: result.total,
          serverFiltered: result.serverFiltered,
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({
          key: requestKey,
          orders: [],
          total: 0,
          serverFiltered: true,
          error: 'Не вдалося завантажити замовлення.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, from, to, status, page, requestKey]);

  const visible = useMemo(() => {
    if (loaded === null) return { rows: [] as Order[], count: 0 };
    if (loaded.serverFiltered) return { rows: loaded.orders, count: loaded.total };

    const fromTime = from ? new Date(from).getTime() : null;
    const toTime = to ? new Date(to).getTime() : null;

    const filtered = loaded.orders.filter((order) => {
      const created = new Date(order.createdAt).getTime();
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      if (status !== '' && order.status !== status) return false;
      return true;
    });

    return {
      rows: filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
      count: filtered.length,
    };
  }, [loaded, from, to, status, page]);

  const handleChangeStatus = useCallback(
    async (id: string, next: OrderStatus) => {
      setActionError(null);
      setPending({ id, status: next });
      try {
        const updated = await setOrderStatus(accessToken, id, next);
        setLoaded((prev) =>
          prev === null
            ? prev
            : {
                ...prev,
                orders: prev.orders.map((order) =>
                  order.id === id ? { ...order, status: updated.status } : order,
                ),
              },
        );
      } catch (err) {
        setActionError(saveErrorMessage(err));
        setReloadKey((key) => key + 1);
      } finally {
        setPending(null);
      }
    },
    [accessToken],
  );

  const pageCount = Math.max(1, Math.ceil(visible.count / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <section className={`${CARD_CLASS} flex flex-col gap-4 p-5`}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeFilter(() => setPreset(value))}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                preset === value
                  ? 'bg-[#1b1f3a] text-white shadow-sm'
                  : 'border border-white/70 bg-white/50 text-slate-600 hover:bg-white/70'
              }`}
            >
              {RANGE_LABELS[value]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {preset === 'custom' && (
            <>
              <div>
                <label htmlFor="orders-from" className={LABEL_CLASS}>
                  Від
                </label>
                <input
                  id="orders-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => changeFilter(() => setCustomFrom(e.target.value))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="orders-to" className={LABEL_CLASS}>
                  До
                </label>
                <input
                  id="orders-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => changeFilter(() => setCustomTo(e.target.value))}
                  className={INPUT_CLASS}
                />
              </div>
            </>
          )}
          <div>
            <label htmlFor="orders-status" className={LABEL_CLASS}>
              Статус
            </label>
            <select
              id="orders-status"
              value={status}
              onChange={(e) => changeFilter(() => setStatus(e.target.value as OrderStatus | ''))}
              className={INPUT_CLASS}
            >
              <option value="">Усі</option>
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!serverFiltered && !isLoading && (
          <Notice kind="info">
            Бекенд ще не підтримує фільтри <code>from</code>/<code>to</code> і пагінацію на{' '}
            <code>GET /orders</code> — список фільтрується у браузері.
          </Notice>
        )}
      </section>

      {actionError && <Notice kind="error">{actionError}</Notice>}
      {error && !isLoading && <Notice kind="error">{error}</Notice>}

      {isLoading && <Skeleton />}

      {!isLoading && !error && visible.rows.length === 0 && (
        <div className={`${CARD_CLASS} p-6 text-center text-slate-600`}>
          За вибраний період замовлень немає.
        </div>
      )}

      {!isLoading && visible.rows.length > 0 && (
        <>
          <p className="text-sm text-slate-500">Знайдено замовлень: {visible.count}</p>
          <div className="flex flex-col gap-4">
            {visible.rows.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onChangeStatus={(id, next) => void handleChangeStatus(id, next)}
                pendingStatus={pending?.id === order.id ? pending.status : null}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0}
                className={GHOST_BUTTON_CLASS}
              >
                Назад
              </button>
              <span className="text-sm text-slate-600">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                disabled={page >= pageCount - 1}
                className={GHOST_BUTTON_CLASS}
              >
                Далі
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
