import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { BackgroundOrbs } from '../components/BackgroundOrbs';

interface ComingSoonPageProps {
  title: string;
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />
      <main className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-slate-500">Ця сторінка ще в розробці.</p>
        <Link to="/" className="text-slate-900 underline">
          На головну
        </Link>
      </main>
    </div>
  );
}
