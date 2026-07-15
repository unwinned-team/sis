import { Header } from '../components/Header';
import { CategoryGrid } from '../components/CategoryGrid';

export function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-5 text-center text-2xl font-semibold text-slate-900 sm:text-3xl">
          Категорії
        </h1>
        <CategoryGrid />
      </main>
    </div>
  );
}
