import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatProductPrice } from '../utils/format';

interface ProductCardProps {
  product: Product;
  showCategory?: boolean;
}

export function ProductCard({ product, showCategory = true }: ProductCardProps) {
  const productUrl = `/product/${product.id}`;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgb(27_31_58/0.12)] transition duration-200 md:hover:-translate-y-1 md:hover:shadow-[0_16px_40px_rgb(27_31_58/0.2)]">
      <Link to={productUrl} className="block aspect-square overflow-hidden bg-slate-100">
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 md:group-hover:scale-105"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-1 px-3 py-3">
        {showCategory && product.category && (
          <span className="text-xs font-medium text-teal-600">{product.category.name}</span>
        )}
        <Link
          to={productUrl}
          className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-slate-950"
        >
          {product.name}
        </Link>
        <span className="line-clamp-1 text-xs text-slate-500">{product.description}</span>
        <span className="pt-1 text-base font-bold text-slate-900">
          {formatProductPrice(product)}
        </span>
        <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row">
          <Link
            to={productUrl}
            className="flex-1 whitespace-nowrap rounded-full bg-[#aee6df] px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-[#14403c] shadow-sm transition hover:bg-[#9adfd7]"
          >
            Купити
          </Link>
          <Link
            to={productUrl}
            className="flex-1 whitespace-nowrap rounded-full bg-[#1b1f3a] px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#272c55]"
          >
            Детальніше
          </Link>
        </div>
      </div>
    </div>
  );
}
