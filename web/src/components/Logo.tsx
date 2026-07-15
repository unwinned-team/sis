import { Link } from 'react-router-dom';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
      {/* Placeholder for the real logo image, drop it in as <img> when ready */}
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200" aria-hidden="true" />
      TBD
    </Link>
  );
}
