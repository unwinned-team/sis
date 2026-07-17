import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatProductPrice } from '../utils/format';

interface ProductCardProps {
  product: Product;
  // Hide the category label on pages already scoped to one category
  showCategory?: boolean;
}

export function ProductCard({ product, showCategory = true }: ProductCardProps) {
  return (
    <Link
      to={`/product/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/40 shadow-sm backdrop-blur-md transition duration-200 md:hover:-translate-y-1 md:hover:shadow-xl"
    >
      <div className="aspect-square overflow-hidden bg-slate-100/40">
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 md:group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3 py-3">
        {showCategory && product.category && (
          <span className="text-xs font-medium text-emerald-600">{product.category.name}</span>
        )}
        <span className="line-clamp-2 text-sm font-semibold text-slate-800">{product.name}</span>
        <span className="mt-auto pt-1 text-base font-bold text-slate-900">
          {formatProductPrice(product)}
        </span>
      </div>
    </Link>
  );
}
