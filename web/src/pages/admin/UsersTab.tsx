import { useEffect, useState } from 'react';
import {
  CUSTOMERS_PAGE_SIZE,
  adjustCustomerBonus,
  getAdminCustomers,
} from '../../api/admin';
import { apiErrorText } from '../../api/client';
import { formatBonus } from '../../utils/format';
import { saveErrorMessage } from './support';
import { Notice, Skeleton } from './ui';
import { CARD_CLASS, GHOST_BUTTON_CLASS, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from './classes';
import type { Customer } from '../../types';

function bonusErrorMessage(err: unknown): string {
  if (apiErrorText(err) === 'Insufficient bonus balance') {
    return 'На балансі недостатньо бонусів для списання.';
  }
  return saveErrorMessage(err);
}

// Нарахування і списання одним полем: знак вибирає кнопка, тому адміну не треба
// вводити мінус вручну і помилятись зі знаком.
function BonusControls({
  accessToken,
  customer,
  onUpdated,
}: {
  accessToken: string;
  customer: Customer;
  onUpdated: (customer: Customer) => void;
}) {
  const [amount, setAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function apply(sign: 1 | -1) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Вкажіть суму більшу за нуль.');
      return;
    }
    const delta = Math.round(value * sign * 100) / 100;

    setError(null);
    setDone(null);
    setIsSaving(true);
    try {
      const updated = await adjustCustomerBonus(accessToken, customer.id, delta);
      onUpdated(updated);
      setAmount('');
      setDone(sign === 1 ? 'Бонуси нараховано.' : 'Бонуси списано.');
    } catch (err) {
      setError(bonusErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Сума"
          aria-label={`Бонуси для ${customer.name}`}
          disabled={isSaving}
          className={`${INPUT_CLASS} !w-28`}
        />
        <button
          type="button"
          onClick={() => void apply(1)}
          disabled={isSaving}
          className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
        >
          {isSaving ? '...' : '+ Нарахувати'}
        </button>
        <button
          type="button"
          onClick={() => void apply(-1)}
          disabled={isSaving}
          className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
        >
          {isSaving ? '...' : '− Списати'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {done && <p className="text-xs text-teal-700">{done}</p>}
    </div>
  );
}

function CustomerRow({
  accessToken,
  customer,
  onUpdated,
}: {
  accessToken: string;
  customer: Customer;
  onUpdated: (customer: Customer) => void;
}) {
  const contacts = [customer.email, customer.phone, customer.telegram].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{customer.name}</span>
          {customer.role === 'ADMIN' && (
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
              Адмін
            </span>
          )}
          {customer.isActive === false && (
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
              Заблокований
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {contacts.length > 0 ? contacts.join(' · ') : 'Без контактів'}
        </p>
      </div>

      <span className="text-sm font-bold text-teal-700">
        {formatBonus(customer.bonusBalance)}
      </span>

      <BonusControls accessToken={accessToken} customer={customer} onUpdated={onUpdated} />
    </li>
  );
}

export function UsersTab({ accessToken }: { accessToken: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  // Пошук застосовується кнопкою/Enter, а не на кожну літеру: інакше кожен
  // символ — окремий запит до бекенда.
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${search}:${page}`;
  const isLoading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    getAdminCustomers(accessToken, { search, page })
      .then((result) => {
        if (cancelled) return;
        setCustomers(result.customers);
        setTotal(result.total);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити користувачів.');
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, search, page, requestKey]);

  const pageCount = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <section className={`${CARD_CLASS} flex flex-col gap-4 p-5`}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPage(0);
            setSearch(searchDraft);
          }}
          className="grid gap-3 sm:grid-cols-[1fr_auto]"
        >
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Пошук за іменем, email, телефоном або Telegram"
            className={INPUT_CLASS}
          />
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Знайти
          </button>
        </form>

        <p className="text-sm text-slate-500">
          Знайдено: {total} · сторінка {page + 1} з {pageCount}
        </p>

        {pageCount > 1 && (
          <nav className="flex flex-wrap gap-1.5">
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
                aria-current={index === page ? 'page' : undefined}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  index === page
                    ? 'bg-[#1b1f3a] text-white shadow-sm'
                    : 'border border-white/70 bg-white/50 text-slate-600 hover:bg-white/70'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </nav>
        )}
      </section>

      {error && <Notice kind="error">{error}</Notice>}
      {isLoading && <Skeleton />}

      {!isLoading && !error && customers.length === 0 && (
        <div className={`${CARD_CLASS} p-6 text-center text-slate-600`}>
          Користувачів не знайдено.
        </div>
      )}

      {!isLoading && customers.length > 0 && (
        <section className={`${CARD_CLASS} overflow-hidden`}>
          <ul className="divide-y divide-white/50">
            {customers.map((customer) => (
              <CustomerRow
                key={customer.id}
                accessToken={accessToken}
                customer={customer}
                onUpdated={(updated) =>
                  setCustomers((prev) =>
                    prev.map((item) => (item.id === updated.id ? updated : item)),
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
