import { useRecommendedProducts } from '../hooks/useRecommendedProducts';
import { ProductCard } from './ProductCard';

export function RecommendedProducts() {
  const { products, isLoading, error } = useRecommendedProducts();

  if (isLoading) {
    return <p className="px-4 py-8 text-center text-slate-400">Завантаження товарів...</p>;
  }

  if (error) {
    return <p className="px-4 py-8 text-center text-red-500">{error}</p>;
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
