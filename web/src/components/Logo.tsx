import { Link } from 'react-router-dom';

export function Logo() {
  return (
    <Link to="/" className="flex items-center">
      <img src="/logo.png" alt="Vape Baza" className="h-12 w-auto" />
    </Link>
  );
}
