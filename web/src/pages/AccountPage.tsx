import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { BackgroundOrbs } from '../components/BackgroundOrbs';
import { BackButton } from '../components/BackButton';
import { useAuth } from '../hooks/useAuth';
import { useMyOrders } from '../hooks/useMyOrders';
import { cancelOrder } from '../api/orders';
import { ApiError } from '../api/client';
import { formatPrice } from '../utils/format';
import type { AuthUser, Order, OrderStatus } from '../types';

const CARD_CLASS = 'rounded-3xl border border-white/60 bg-white/40 shadow-lg backdrop-blur-md';

const INPUT_CLASS =
  'w-full rounded-xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition focus:border-teal-400 focus:ring-2 focus:ring-teal-300/60';

const LABEL_CLASS = 'mb-1.5 block text-sm font-semibold text-slate-600';

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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function profileErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'Сервер ще не підтримує редагування профілю. Спробуйте пізніше.';
    if (err.status === 400) return 'Перевірте правильність введених даних.';
    if (err.status === 401) return 'Сесія закінчилася. Увійдіть ще раз.';
  }
  return 'Не вдалося зберегти зміни. Спробуйте ще раз.';
}

function ProfileCard({ user }: { user: AuthUser }) {
  const { updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [telegram, setTelegram] = useState(user.telegram ?? '');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSaving(true);
    try {
      const trimmedPhone = phone.trim();
      const trimmedTelegram = telegram.trim();
      await updateProfile({
        name: name.trim(),
        phone: trimmedPhone === '' ? null : trimmedPhone,
        telegram: trimmedTelegram === '' ? null : trimmedTelegram,
      });
      setMessage({ kind: 'success', text: 'Дані оновлено.' });
    } catch (err) {
      setMessage({ kind: 'error', text: profileErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <section className={`${CARD_CLASS} flex flex-col gap-5 p-6 sm:p-8`}>
      <div>
        <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
        {user.email && <p className="text-sm text-slate-500">{user.email}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/60 bg-white/50 p-3">
          <dt className="text-xs font-medium text-slate-500">Бонусний баланс</dt>
          <dd className="mt-1 text-lg font-bold text-teal-700">{formatPrice(user.bonusBalance)}</dd>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/50 p-3">
          <dt className="text-xs font-medium text-slate-500">З нами з</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-700">{formatDate(user.createdAt)}</dd>
        </div>
      </dl>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="profile-name" className={LABEL_CLASS}>
            Ім'я
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoComplete="name"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="profile-phone" className={LABEL_CLASS}>
            Номер телефону
          </label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            autoComplete="tel"
            placeholder="+380 XX XXX XX XX"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="profile-telegram" className={LABEL_CLASS}>
            Telegram
          </label>
          <input
            id="profile-telegram"
            type="text"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            maxLength={40}
            placeholder="@username"
            className={INPUT_CLASS}
          />
        </div>

        {message && (
          <p className={message.kind === 'success' ? 'text-sm text-teal-700' : 'text-sm text-red-500'}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-full bg-[#aee6df] py-2.5 text-sm font-bold uppercase tracking-wide text-[#14403c] shadow-sm transition hover:bg-[#9adfd7] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Зачекайте...' : 'Зберегти зміни'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void handleLogout()}
        className="rounded-full border border-white/70 bg-white/50 py-2.5 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-sm transition hover:bg-white/70"
      >
        Вийти з акаунта
      </button>
    </section>
  );
}

function OrderCard({
  order,
  onCancel,
  isCancelling,
}: {
  order: Order;
  onCancel: (id: string) => void;
  isCancelling: boolean;
}) {
  return (
    <article className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{formatDate(order.createdAt)}</p>
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
          Разом: <span className="text-base font-bold text-slate-900">{formatPrice(order.totalAmount)}</span>
        </p>
        {order.status === 'NEW' && (
          <button
            type="button"
            onClick={() => onCancel(order.id)}
            disabled={isCancelling}
            className="rounded-full border border-red-200 bg-red-50/80 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCancelling ? 'Скасування...' : 'Скасувати'}
          </button>
        )}
      </div>
    </article>
  );
}

function OrdersSection({ accessToken }: { accessToken: string }) {
  const { orders, isLoading, error, reload } = useMyOrders(accessToken);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCancelError(null);
    setCancellingId(id);
    try {
      await cancelOrder(accessToken, id);
      reload();
    } catch {
      setCancelError('Не вдалося скасувати замовлення. Спробуйте ще раз.');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-slate-900">Мої замовлення</h2>

      {isLoading && (
        <div className={`${CARD_CLASS} animate-pulse p-6`}>
          <div className="h-4 w-40 rounded bg-white/70" />
          <div className="mt-3 h-4 w-full rounded bg-white/60" />
          <div className="mt-2 h-4 w-2/3 rounded bg-white/60" />
        </div>
      )}

      {error && !isLoading && <p className="text-sm text-red-500">{error}</p>}
      {cancelError && <p className="mb-3 text-sm text-red-500">{cancelError}</p>}

      {!isLoading && !error && orders.length === 0 && (
        <div className={`${CARD_CLASS} p-6 text-center`}>
          <p className="text-slate-600">У вас ще немає замовлень.</p>
          <Link
            to="/"
            className="mt-3 inline-block rounded-full bg-[#1b1f3a] px-5 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#272c55]"
          >
            До покупок
          </Link>
        </div>
      )}

      {!isLoading && orders.length > 0 && (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onCancel={(id) => void handleCancel(id)}
              isCancelling={cancellingId === order.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountSkeleton() {
  return (
    <div className={`${CARD_CLASS} animate-pulse p-8`}>
      <div className="h-6 w-48 rounded bg-white/70" />
      <div className="mt-4 h-4 w-full rounded bg-white/60" />
      <div className="mt-2 h-4 w-3/4 rounded bg-white/60" />
    </div>
  );
}

export function AccountPage() {
  const { user, accessToken, isReady } = useAuth();

  if (isReady && !user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <BackButton />
        </div>

        <h1 className="heading-glow mb-6 text-center text-2xl font-extrabold sm:text-3xl">
          Особистий кабінет
        </h1>

        {!isReady && <AccountSkeleton />}

        {isReady && user && accessToken && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr] lg:items-start">
            <ProfileCard key={user.id} user={user} />
            <OrdersSection accessToken={accessToken} />
          </div>
        )}
      </main>
    </div>
  );
}
