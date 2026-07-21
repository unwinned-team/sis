import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { BackgroundOrbs } from '../components/BackgroundOrbs';
import { BackButton } from '../components/BackButton';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { createOrder } from '../api/orders';
import { ApiError, apiErrorText } from '../api/client';
import { formatPrice } from '../utils/format';
import type { CartItem, Order, PaymentMethod } from '../types';

const CARD_CLASS = 'rounded-3xl border border-white/60 bg-white/40 shadow-lg backdrop-blur-md';

const ADDRESS_INPUT_CLASS =
  'w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition focus:border-teal-400 focus:ring-2 focus:ring-teal-300/60';

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CARD', label: 'Карткою' },
  { value: 'CASH', label: 'Готівкою' },
  { value: 'BONUS', label: 'Бонусами' },
];

function formatTotal(value: number): string {
  return `₴${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function checkoutErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const message = apiErrorText(error);
    if (error.status === 401) return 'Сесія закінчилася. Увійдіть ще раз.';
    if (error.status === 409 && message === 'Insufficient bonus balance')
      return 'Недостатньо бонусів для оплати цього замовлення.';
    if (error.status === 409 && message === 'Products unavailable')
      return 'Деякі товари зараз недоступні. Приберіть їх із кошика та спробуйте ще раз.';
    if (error.status === 404) return 'Деяких товарів більше немає. Приберіть їх із кошика.';
    if (message) return message;
  }
  return 'Не вдалося оформити замовлення. Спробуйте ще раз.';
}

function unavailableIdsFrom(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  const data = error.data;
  if (!data || typeof data !== 'object') return [];
  const details = (data as { details?: unknown }).details;
  if (!details || typeof details !== 'object') return [];
  const ids = (details as { productIds?: unknown }).productIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string');
}

interface CartLineProps {
  item: CartItem;
  isBlocked: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

function CartLine({ item, isBlocked, onQuantityChange, onRemove }: CartLineProps) {
  const price = Number(item.price);
  const lineTotal = Number.isNaN(price) ? null : price * item.quantity;

  return (
    <li
      className={`flex gap-3 p-4 sm:gap-4 ${isBlocked ? 'bg-red-50/60' : ''}`}
      data-testid="cart-line"
    >
      <Link
        to={`/product/${item.productId}`}
        className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100"
      >
        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/product/${item.productId}`}
            className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-slate-950"
          >
            {item.name}
          </Link>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Прибрати ${item.name}`}
            className="text-lg leading-none text-slate-400 transition hover:text-red-500"
          >
            ✕
          </button>
        </div>

        <span className="text-xs text-slate-500">{formatPrice(item.price)} / шт</span>
        {isBlocked && (
          <span className="text-xs font-semibold text-red-600">Немає в наявності</span>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center rounded-full border border-white/70 bg-white/60 shadow-sm">
            <button
              type="button"
              onClick={() => onQuantityChange(item.quantity - 1)}
              disabled={item.quantity <= 1}
              aria-label="Менше"
              className="px-3 py-1.5 text-slate-600 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              −
            </button>
            <span className="min-w-8 text-center text-sm font-semibold text-slate-800">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantityChange(item.quantity + 1)}
              disabled={item.quantity >= 99}
              aria-label="Більше"
              className="px-3 py-1.5 text-slate-600 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              +
            </button>
          </div>
          {lineTotal !== null && (
            <span className="text-sm font-bold text-slate-900">{formatTotal(lineTotal)}</span>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyCart() {
  return (
    <div className={`${CARD_CLASS} mx-auto max-w-md px-6 py-12 text-center`}>
      <p className="text-4xl">🛒</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Кошик порожній</h1>
      <p className="mt-2 text-slate-500">Додайте товари з каталогу, щоб оформити замовлення.</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        До каталогу
      </Link>
    </div>
  );
}

function OrderSuccess({ order }: { order: Order }) {
  return (
    <div className={`${CARD_CLASS} mx-auto max-w-md px-6 py-12 text-center`}>
      <p className="text-4xl">✅</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Замовлення прийнято</h1>
      <p className="mt-2 text-slate-500">
        Сума: <span className="font-semibold text-slate-800">{formatPrice(order.totalAmount)}</span>
        . Статус можна відстежити в особистому кабінеті.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <Link
          to="/account"
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Мої замовлення
        </Link>
        <Link
          to="/"
          className="rounded-full border border-white/70 bg-white/50 px-5 py-2.5 text-sm font-semibold text-slate-700 backdrop-blur-sm transition hover:bg-white/70"
        >
          На головну
        </Link>
      </div>
    </div>
  );
}

export function CartPage() {
  const { user, accessToken, isReady } = useAuth();
  const {
    items,
    totalQuantity,
    totalAmount,
    setQuantity,
    removeItem,
    clear,
    shippingAddress,
    setShippingAddress,
  } = useCart();
  const navigate = useNavigate();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  const bonusBalance = user ? Number(user.bonusBalance) : 0;
  const bonusShortfall = paymentMethod === 'BONUS' && user !== null && bonusBalance < totalAmount;
  const addressComplete =
    shippingAddress.city.trim() !== '' &&
    shippingAddress.oblast.trim() !== '' &&
    shippingAddress.branch.trim() !== '';

  function updateAddressField(field: keyof typeof shippingAddress, value: string) {
    setShippingAddress({ ...shippingAddress, [field]: value });
  }

  async function handleCheckout() {
    if (!accessToken) {
      navigate('/auth?next=/cart');
      return;
    }
    setError(null);
    setBlockedIds([]);
    setIsSubmitting(true);
    try {
      const order = await createOrder(accessToken, {
        paymentMethod,
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        shippingAddress,
      });
      clear();
      setCreatedOrder(order);
    } catch (err) {
      setBlockedIds(unavailableIdsFrom(err));
      setError(checkoutErrorText(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  function removeBlocked() {
    blockedIds.forEach(removeItem);
    setBlockedIds([]);
    setError(null);
  }

  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <BackButton />
        </div>

        {createdOrder ? (
          <OrderSuccess order={createdOrder} />
        ) : items.length === 0 ? (
          <EmptyCart />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
            <section className={`${CARD_CLASS} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-white/50 px-4 py-3 sm:px-5">
                <h1 className="text-lg font-bold text-slate-900">Кошик</h1>
                <span className="text-sm text-slate-500">
                  {totalQuantity} шт · {items.length} поз.
                </span>
              </div>
              <ul className="divide-y divide-white/50">
                {items.map((item) => (
                  <CartLine
                    key={item.productId}
                    item={item}
                    isBlocked={blockedIds.includes(item.productId)}
                    onQuantityChange={(quantity) => setQuantity(item.productId, quantity)}
                    onRemove={() => removeItem(item.productId)}
                  />
                ))}
              </ul>
            </section>

            <aside className={`${CARD_CLASS} p-5`}>
              <h2 className="text-base font-bold text-slate-900">Оформлення</h2>

              <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-semibold text-slate-600">Оплата</legend>
                <div className="flex flex-col gap-1.5">
                  {PAYMENT_OPTIONS.map((option) => {
                    const isBonus = option.value === 'BONUS';
                    const disabled = isBonus && user === null;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                          paymentMethod === option.value
                            ? 'border-teal-400 bg-teal-50/70 text-teal-800'
                            : 'border-white/70 bg-white/40 text-slate-700 hover:bg-white/60'
                        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={option.value}
                          checked={paymentMethod === option.value}
                          onChange={() => setPaymentMethod(option.value)}
                          disabled={disabled}
                          className="accent-teal-500"
                        />
                        <span>{option.label}</span>
                        {isBonus && user && (
                          <span className="ml-auto text-xs text-slate-500">
                            {formatPrice(user.bonusBalance)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-semibold text-slate-600">
                  Доставка (Нова Пошта)
                </legend>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={shippingAddress.city}
                    onChange={(e) => updateAddressField('city', e.target.value)}
                    placeholder="Місто"
                    maxLength={100}
                    aria-label="Місто"
                    className={ADDRESS_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={shippingAddress.oblast}
                    onChange={(e) => updateAddressField('oblast', e.target.value)}
                    placeholder="Область"
                    maxLength={100}
                    aria-label="Область"
                    className={ADDRESS_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={shippingAddress.branch}
                    onChange={(e) => updateAddressField('branch', e.target.value)}
                    placeholder="Номер відділення"
                    maxLength={20}
                    aria-label="Номер відділення Нової Пошти"
                    className={ADDRESS_INPUT_CLASS}
                  />
                </div>
              </fieldset>

              <div className="mt-4 flex items-center justify-between border-t border-white/50 pt-4">
                <span className="text-sm font-semibold text-slate-600">Разом</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatTotal(totalAmount)}
                </span>
              </div>

              {bonusShortfall && (
                <p className="mt-2 text-xs text-red-600">
                  Недостатньо бонусів: доступно {formatPrice(user.bonusBalance)}.
                </p>
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              {blockedIds.length > 0 && (
                <button
                  type="button"
                  onClick={removeBlocked}
                  className="mt-2 w-full rounded-full border border-red-200 bg-red-50/70 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100/80"
                >
                  Прибрати недоступні товари
                </button>
              )}

              {isReady && user === null ? (
                <>
                  <Link
                    to="/auth?next=/cart"
                    className="mt-4 block w-full rounded-full bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
                  >
                    Увійти та оформити
                  </Link>
                  <p className="mt-2 text-center text-xs text-slate-400">
                    Кошик збережеться після входу.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isSubmitting || !isReady || bonusShortfall || !addressComplete}
                  className="mt-4 w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-900/50"
                >
                  {isSubmitting ? 'Оформлюємо…' : 'Оформити замовлення'}
                </button>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
