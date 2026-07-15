import { Header } from '../components/Header';
import { CategoryGrid } from '../components/CategoryGrid';
import { RecommendedProducts } from '../components/RecommendedProducts';
import { BackgroundOrbs } from '../components/BackgroundOrbs';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <section>
          <h1 className="heading-glow mb-5 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Категорії
          </h1>
          <CategoryGrid />
        </section>

        <section className="mt-10 sm:mt-14">
          <h2 className="heading-glow mb-5 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Рекомендовані товари
          </h2>
          <RecommendedProducts />
        </section>
      </main>
    </div>
  );
}
