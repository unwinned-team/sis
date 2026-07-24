import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchProducts } from '../api/products';
import { formatProductPrice } from '../utils/format';
import { Search, X, ShoppingCart } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import type { Product } from '../types';

interface SearchBarProps {
  onActiveChange?: (active: boolean) => void;
}

function SearchResultItem({ product, handleSelect }: { product: Product; handleSelect: (id: string) => void }) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const activeVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
    addItem(product, 1, activeVariant);
    
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <div
      onClick={() => handleSelect(product.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(product.id); }}
      className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-slate-50 cursor-pointer w-full text-left"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
        <img 
          src={product.imageUrl} 
          alt={product.name} 
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex flex-col overflow-hidden flex-1">
        <span className="truncate text-sm font-medium text-slate-700">
          {product.name}
        </span>
        <span className="text-xs font-bold text-slate-900">
          {formatProductPrice(product)}
        </span>
      </div>
      <button
        type="button"
        onClick={handleAddToCart}
        aria-label="Додати в кошик"
        title="Додати в кошик"
        className={`pointer-events-auto shrink-0 flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-all duration-200 active:scale-95 ${
          justAdded 
            ? 'bg-teal-600 text-white' 
            : 'bg-teal-100 text-teal-800 hover:bg-teal-200'
        }`}
      >
        {justAdded ? (
          <span className="text-sm font-bold">✓</span>
        ) : (
          <ShoppingCart className="h-4 w-4" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}

export function SearchBar({ onActiveChange }: SearchBarProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    onActiveChange?.(isOpen);
  }, [isOpen, onActiveChange]);

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
        <div className="absolute left-3 text-slate-500 pointer-events-none flex items-center justify-center">
          <Search className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Поиск товаров..."
          className={`h-10 w-full rounded-lg bg-black/10 pl-10 text-slate-700 outline-none transition focus:bg-black/20 focus:ring-2 focus:ring-teal-400 ${isOpen ? 'max-sm:pr-10 pr-4' : 'pr-4'}`}
        />
        {isOpen && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setQuery('');
            }}
            className="absolute right-2 p-1 text-slate-500 sm:hidden hover:text-slate-700"
            aria-label="Закрыть поиск"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        )}
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
                <SearchResultItem key={product.id} product={product} handleSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
