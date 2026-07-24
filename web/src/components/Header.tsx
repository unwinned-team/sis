import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { BurgerButton } from './BurgerButton';
import { SideMenu } from './SideMenu';
import { useCart } from '../hooks/useCart';
import { SearchBar } from './SearchBar';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { totalQuantity } = useCart();

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
            <BurgerButton isOpen={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} />
          </div>
        </div>
      </header>

      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
}
