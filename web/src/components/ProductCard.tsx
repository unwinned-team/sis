import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Product, ProductVariant } from '../types';
import { formatProductPrice } from '../utils/format';
import { useCart } from '../hooks/useCart';

interface ProductCardProps {
  product: Product;
  showCategory?: boolean;
  selectedVariant?: ProductVariant | null;
  customBadge?: string;
}

export function ProductCard({ product, showCategory = true, selectedVariant = null, customBadge }: ProductCardProps) {
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
    e.stopPropagation();
    const variant = selectedVariant || (product.variants && product.variants.length > 0 ? product.variants[0] : null);
    addItem(product, 1, variant);
    
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <div className="group relative flex aspect-[3/4] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition duration-200 md:hover:-translate-y-1 md:hover:shadow-md">
      <Link to={productUrl} className="absolute inset-0 z-0">
        <span className="sr-only">Переглянути {product.name}</span>
      </Link>
      
      {/* Top part: Image on light background */}
      <div className="pointer-events-none relative flex flex-1 overflow-hidden bg-slate-50/50 p-4">
        {(customBadge || (showCategory && product.category)) && (
          <div className="absolute left-3 top-3 z-10">
            <span className="rounded-md bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-md">
              {customBadge || product.category?.name}
            </span>
          </div>
        )}
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-contain transition-transform duration-300 md:group-hover:scale-105"
        />
      </div>
      
      {/* Bottom part: Opaque block, Dark text */}
      <div className="pointer-events-none relative flex shrink-0 flex-col gap-1.5 bg-white px-3 py-2.5">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 transition-colors group-hover:text-teal-700">
          {product.name}
        </h3>
        
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-slate-900">
            {formatProductPrice(product)}
          </span>
          
          <button
            type="button"
            onClick={handleAddToCart}
            aria-label="Додати в кошик"
            title="Додати в кошик"
            className={`pointer-events-auto relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-all duration-200 active:scale-95 ${
              justAdded 
                ? 'bg-teal-600 text-white' 
                : 'bg-teal-200 text-teal-950 hover:bg-teal-300'
            }`}
          >
            {justAdded ? (
              <span className="text-sm font-bold">✓</span>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
