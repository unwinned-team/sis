import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchProducts } from '../api/products';
import { formatProductPrice } from '../utils/format';

export function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data, isPending, isError } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchProducts(debounced),
    enabled: debounced !== '' && isOpen,
  });

  const handleSelect = (productId: string) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/product/${productId}`);
  };

  return (
    <div ref={wrapperRef} className="relative flex w-full items-center">
      <div className="relative flex w-full items-center">
        <span className="absolute left-3 text-slate-500">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Поиск товаров..."
          className="h-10 w-full rounded-lg bg-black/10 pl-10 pr-4 text-slate-700 outline-none transition focus:bg-black/20 focus:ring-2 focus:ring-teal-400"
        />
      </div>

      {isOpen && query.trim() !== '' && (
        <div className="absolute left-0 right-0 top-full mt-2 max-h-[70vh] overflow-y-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-black/5 z-50">
          {isPending && <div className="p-4 text-center text-sm text-slate-500">Шукаємо…</div>}
          {isError && <div className="p-4 text-center text-sm text-red-500">Помилка пошуку</div>}
          
          {!isPending && !isError && data?.length === 0 && (
            <div className="p-4 text-center text-sm text-slate-500">
              Нічого не знайдено за запитом «{debounced}»
            </div>
          )}

          {!isPending && !isError && data && data.length > 0 && (
            <div className="flex flex-col gap-1">
              {data.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleSelect(product.id)}
                  className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-slate-50 text-left w-full"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                    <img 
                      src={product.imageUrl} 
                      alt={product.name} 
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium text-slate-700">
                      {product.name}
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {formatProductPrice(product)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
