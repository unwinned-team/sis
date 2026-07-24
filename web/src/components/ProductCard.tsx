import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatProductPrice } from '../utils/format';
import { useCart } from '../hooks/useCart';

interface ProductCardProps {
  product: Product;
  showCategory?: boolean;
}

export function ProductCard({ product, showCategory = true }: ProductCardProps) {
  const { addItem } = useCart();
  const productUrl = `/product/${product.id}`;
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    const variant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
    addItem(product, 1, variant);
    
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <div className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl bg-slate-100 shadow-[0_10px_30px_rgb(27_31_58/0.12)] transition duration-200 md:hover:-translate-y-1 md:hover:shadow-[0_16px_40px_rgb(27_31_58/0.2)]">
      <Link to={productUrl} className="absolute inset-0">
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 md:group-hover:scale-105"
        />
      </Link>
      {showCategory && product.category && (
        <div className="pointer-events-none absolute left-3 top-3 z-10">
          <span className="rounded-md bg-black/40 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-md">
            {product.category.name}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#1b1f3a]/95 via-[#1b1f3a]/50 to-transparent" />
      <div className="pointer-events-none relative flex flex-col gap-1 px-3 py-3 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <Link
          to={productUrl}
          className="line-clamp-2 text-sm font-semibold text-white hover:text-teal-100"
        >
          {product.name}
        </Link>
        <span className="line-clamp-1 text-xs text-slate-300">{product.description}</span>
        <span className="pt-1 text-base font-bold text-white">
          {formatProductPrice(product)}
        </span>
        <div className="mt-auto flex flex-row items-stretch gap-2 pt-2">
          <button
            type="button"
            onClick={handleAddToCart}
            className={`flex flex-[3] items-center justify-center whitespace-nowrap rounded-full px-2 py-2 text-center text-[13px] font-bold uppercase tracking-wide shadow-sm transition-all duration-200 active:scale-95 ${
              justAdded ? 'bg-teal-500 text-white' : 'bg-[#aee6df] text-[#14403c] hover:bg-[#9adfd7]'
            }`}
          >
            {justAdded ? '✓' : 'Купити'}
          </button>
          <Link
            to={productUrl}
            className="flex flex-[2] items-center justify-center whitespace-nowrap rounded-full bg-[#1b1f3a] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#272c55]"
          >
            Детальніше
          </Link>
        </div>
      </div>
    </div>
  );
}
