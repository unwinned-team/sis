import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Header } from '../components/Header';
import { BackgroundOrbs } from '../components/BackgroundOrbs';
import { BackButton } from '../components/BackButton';
import { ProductCard } from '../components/ProductCard';
import { searchProducts } from '../api/products';

const INPUT_CLASS =
  'w-full rounded-full border border-white/70 bg-white/70 px-5 py-3 text-base text-slate-800 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition focus:border-teal-400 focus:ring-2 focus:ring-teal-300/60';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(query.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Запит у URL: перезавантаження і "назад" зберігають пошук.
  useEffect(() => {
    setParams(debounced ? { q: debounced } : {}, { replace: true });
  }, [debounced, setParams]);

  const { data, isPending, isError } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchProducts(debounced),
    enabled: debounced !== '',
    placeholderData: (previous) => previous,
  });

  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <BackButton />
        </div>

        <h1 className="heading-glow mb-6 text-center text-2xl font-extrabold sm:text-3xl">
          Пошук
        </h1>

        <div className="mx-auto mb-8 max-w-xl">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Назва товару, смак, опис…"
            autoFocus
            maxLength={200}
            aria-label="Пошук товарів"
            className={INPUT_CLASS}
          />
        </div>

        {debounced === '' && (
          <p className="text-center text-slate-500">Почніть вводити запит — шукаємо по назвах та описах.</p>
        )}

        {debounced !== '' && isPending && (
          <p className="text-center text-slate-500">Шукаємо…</p>
        )}

        {isError && (
          <p className="text-center text-red-500">Не вдалося виконати пошук. Спробуйте ще раз.</p>
        )}

        {debounced !== '' && !isPending && !isError && data && data.length === 0 && (
          <p className="text-center text-slate-500">
            За запитом «{debounced}» нічого не знайдено.
          </p>
        )}

        {data && data.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
