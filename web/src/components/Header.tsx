import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { BurgerButton } from './BurgerButton';
import { SideMenu } from './SideMenu';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { SearchBar } from './SearchBar';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { totalQuantity } = useCart();
  const { user } = useAuth();

  return (
    <>
      <header className="liquid-glass sticky top-0 z-30">
        <div className="flex items-center justify-between gap-4 px-3 py-3 sm:px-4">
          <div className="flex shrink-0 items-center">
            <Logo />
          </div>
          
          <div className="flex flex-1 justify-center max-w-2xl mx-auto">
            <SearchBar />
          </div>
          
          <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
            <Link
              to="/cart"
              aria-label={`Кошик${totalQuantity > 0 ? `, товарів: ${totalQuantity}` : ''}`}
              className="relative flex h-10 items-center justify-center gap-2 rounded-lg px-2 sm:px-3 transition hover:bg-white/50 text-slate-700"
            >
              <span className="text-xl">🛒</span>
              <span className="hidden text-sm font-medium md:block">Корзина</span>
              {totalQuantity > 0 && (
                <span className="absolute right-0 top-0 sm:-right-1 sm:-top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 px-1 text-[11px] font-bold leading-none text-white shadow-sm">
                  {totalQuantity > 99 ? '99+' : totalQuantity}
                </span>
              )}
            </Link>
            <Link
              to={user ? "/account" : "/auth"}
              aria-label="Профіль"
              className="flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-white/50 text-slate-700"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
            <BurgerButton isOpen={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} />
          </div>
        </div>
      </header>

      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
}
