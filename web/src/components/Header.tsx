import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { BurgerButton } from './BurgerButton';
import { SideMenu } from './SideMenu';
import { useCart } from '../hooks/useCart';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { totalQuantity } = useCart();

  return (
    <>
      <header className="liquid-glass sticky top-0 z-30">
        <div className="grid grid-cols-[88px_1fr_88px] items-center px-3 py-3 sm:px-4">
          <div className="flex items-center gap-1">
            <Link
              to="/cart"
              aria-label={`Кошик${totalQuantity > 0 ? `, товарів: ${totalQuantity}` : ''}`}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:bg-white/50"
            >
              🛒
              {totalQuantity > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 px-1 text-[11px] font-bold leading-none text-white shadow-sm">
                  {totalQuantity > 99 ? '99+' : totalQuantity}
                </span>
              )}
            </Link>
            <Link
              to="/search"
              aria-label="Пошук товарів"
              className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:bg-white/50"
            >
              🔍
            </Link>
          </div>
          <div className="flex justify-center">
            <Logo />
          </div>
          <div className="flex justify-end">
            <BurgerButton isOpen={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} />
          </div>
        </div>
      </header>

      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
}
