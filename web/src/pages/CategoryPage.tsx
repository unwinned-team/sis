import { Link, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { BackgroundOrbs } from '../components/BackgroundOrbs';
import { BackButton } from '../components/BackButton';
import { ProductCard } from '../components/ProductCard';
import { useCategoryDetails } from '../hooks/useCategoryDetails';
import { formatProductPrice } from '../utils/format';

function CategorySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mx-auto h-9 w-56 rounded-full bg-white/50" />
      <div className="mt-8 overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md">
        <div className="grid sm:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="aspect-square bg-slate-200/40" />
          <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
            <div className="h-6 w-32 rounded-full bg-white/60" />
            <div className="h-7 w-3/4 rounded-lg bg-white/60" />
            <div className="h-4 w-full rounded bg-white/50" />
            <div className="h-4 w-2/3 rounded bg-white/50" />
            <div className="h-8 w-28 rounded-lg bg-white/60" />
          </div>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md"
          >
            <div className="aspect-square bg-slate-200/40" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 rounded bg-white/60" />
              <div className="h-5 w-1/2 rounded bg-white/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { category, otherCategories, popularProduct, products, isLoading, notFound, error } =
    useCategoryDetails(slug);

  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <BackButton />
        </div>

        {isLoading && <CategorySkeleton />}

        {error && <p className="px-4 py-12 text-center text-red-500">{error}</p>}

        {notFound && !isLoading && (
          <div className="mx-auto max-w-md rounded-3xl border border-white/60 bg-white/40 px-6 py-12 text-center shadow-sm backdrop-blur-md">
            <h1 className="text-2xl font-bold text-slate-900">Категорію не знайдено</h1>
            <p className="mt-2 text-slate-500">
              Можливо, посилання застаріло або категорію було перейменовано.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              На головну
            </Link>
          </div>
        )}

        {category && !isLoading && (
          <>
            <h1 className="heading-glow text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {category.name}
            </h1>

            {popularProduct && (
              <section className="mt-8">
                <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/40 shadow-lg backdrop-blur-md">
                  <div className="grid sm:grid-cols-[minmax(0,20rem)_1fr]">
                    <div className="aspect-square overflow-hidden bg-gradient-to-br from-emerald-100/40 to-sky-100/40">
                      <img
                        src={popularProduct.imageUrl}
                        alt={popularProduct.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col justify-center gap-3 p-6 sm:p-10">
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-3 py-1 text-xs font-semibold text-emerald-700">
                        🔥 Хіт продажів категорії
                      </span>
                      <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                        {popularProduct.name}
                      </h2>
                      <p className="line-clamp-3 text-sm leading-relaxed text-slate-600">
                        {popularProduct.description}
                      </p>
                      <p className="text-2xl font-bold text-slate-900">
                        {formatProductPrice(popularProduct)}
                      </p>
                      <Link
                        to={`/product/${popularProduct.id}`}
                        className="mt-1 inline-block w-fit rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
                      >
                        Переглянути товар
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="mt-10 sm:mt-14">
              <h2 className="heading-glow mb-5 text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Усі товари
                <span className="ml-2 align-middle text-sm font-semibold text-slate-400">
                  {products.length}
                </span>
              </h2>
              {products.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} showCategory={false} />
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl border border-white/60 bg-white/40 px-6 py-10 text-center text-slate-500 shadow-sm backdrop-blur-md">
                  У цій категорії поки немає товарів.
                </p>
              )}
            </section>

            {otherCategories.length > 0 && (
              <section className="mt-10 sm:mt-14">
                <h2 className="heading-glow mb-5 text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  Інші категорії
                </h2>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {otherCategories.map((item) => (
                    <Link
                      key={item.id}
                      to={`/category/${item.slug}`}
                      className="rounded-full border border-white/60 bg-white/40 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white/65 hover:text-slate-900"
                    >
                      {item.name}
                    </Link>
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
