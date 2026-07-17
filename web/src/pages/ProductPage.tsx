import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { BackgroundOrbs } from '../components/BackgroundOrbs';
import { BackButton } from '../components/BackButton';
import { ProductCard } from '../components/ProductCard';
import { VariantChooser } from '../components/VariantChooser';
import { useProduct } from '../hooks/useProduct';
import { formatPrice } from '../utils/format';
import type { Product, ProductVariant } from '../types';

function distinct(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function ProductSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md">
      <div className="grid sm:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="aspect-square bg-slate-200/40" />
        <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
          <div className="h-5 w-40 rounded-full bg-white/60" />
          <div className="h-8 w-3/4 rounded-lg bg-white/60" />
          <div className="h-4 w-full rounded bg-white/50" />
          <div className="h-4 w-2/3 rounded bg-white/50" />
          <div className="h-9 w-32 rounded-lg bg-white/60" />
          <div className="h-11 w-44 rounded-full bg-white/60" />
        </div>
      </div>
    </div>
  );
}

interface ProductDetailsProps {
  product: Product;
}

function ProductDetails({ product }: ProductDetailsProps) {
  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const tastes = useMemo(() => distinct(variants.map((v) => v.taste)), [variants]);
  const sizes = useMemo(() => distinct(variants.map((v) => v.size)), [variants]);

  const [selectedTaste, setSelectedTaste] = useState<string | null>(tastes[0] ?? null);
  const [selectedSize, setSelectedSize] = useState<string | null>(sizes[0] ?? null);

  const selectedVariant: ProductVariant | undefined = variants.find(
    (variant) =>
      (tastes.length === 0 || variant.taste === selectedTaste) &&
      (sizes.length === 0 || variant.size === selectedSize),
  );

  const price = selectedVariant?.price ?? product.price;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-lg backdrop-blur-md">
      <div className="grid sm:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="aspect-square overflow-hidden bg-gradient-to-br from-emerald-100/40 to-sky-100/40">
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        </div>

        <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
          {product.category && (
            <Link
              to={`/category/${product.category.slug}`}
              className="inline-flex w-fit items-center rounded-full border border-emerald-200/70 bg-emerald-50/70 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100/80"
            >
              {product.category.name}
            </Link>
          )}

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {product.name}
          </h1>

          <p className="leading-relaxed text-slate-600">{product.description}</p>

          <VariantChooser
            tastes={tastes}
            sizes={sizes}
            selectedTaste={selectedTaste}
            selectedSize={selectedSize}
            onTasteChange={setSelectedTaste}
            onSizeChange={setSelectedSize}
          />

          <p className="text-3xl font-bold text-slate-900">{formatPrice(price)}</p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled
              title="Кошик з'явиться незабаром"
              className="cursor-not-allowed rounded-full bg-slate-900/60 px-7 py-3 text-sm font-semibold text-white shadow-sm"
            >
              🛒 Додати в кошик
            </button>
            <span className="text-xs text-slate-400">Кошик з'явиться незабаром</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { product, relatedProducts, isLoading, notFound, error } = useProduct(id);

  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <BackButton />
        </div>

        {isLoading && <ProductSkeleton />}

        {error && <p className="px-4 py-12 text-center text-red-500">{error}</p>}

        {notFound && !isLoading && (
          <div className="mx-auto max-w-md rounded-3xl border border-white/60 bg-white/40 px-6 py-12 text-center shadow-sm backdrop-blur-md">
            <h1 className="text-2xl font-bold text-slate-900">Товар не знайдено</h1>
            <p className="mt-2 text-slate-500">
              Можливо, посилання застаріло або товар було знято з продажу.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              На головну
            </Link>
          </div>
        )}

        {product && !isLoading && (
          <>
            {/* key remounts details so variant selection resets when navigating between products */}
            <ProductDetails key={product.id} product={product} />

            {relatedProducts.length > 0 && (
              <section className="mt-10 sm:mt-14">
                <h2 className="heading-glow mb-5 text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  Схожі товари
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {relatedProducts.map((item) => (
                    <ProductCard key={item.id} product={item} showCategory={false} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
