import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { BurgerButton } from './BurgerButton';
import { SideMenu } from './SideMenu';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { SearchBar } from './SearchBar';
import { ShoppingCart, User } from 'lucide-react';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { totalQuantity } = useCart();
  const { user, isReady } = useAuth();

  const profileTo = !isReady ? '#' : user ? '/account' : '/auth';

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
          
          <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-4">
            <Link
              to="/cart"
              aria-label={`Кошик${totalQuantity > 0 ? `, товарів: ${totalQuantity}` : ''}`}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-white/50 text-slate-700"
            >
              <ShoppingCart className="h-6 w-6" strokeWidth={1.5} />
              {totalQuantity > 0 && (
                <span className="absolute right-0 top-0 sm:-right-1 sm:-top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 px-1 text-[11px] font-bold leading-none text-white shadow-sm">
                  {totalQuantity > 99 ? '99+' : totalQuantity}
                </span>
              )}
            </Link>
            <Link
              to={profileTo}
              aria-label="Профіль"
              className="flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-white/50 text-slate-700"
            >
              <User className="h-6 w-6" strokeWidth={1.5} />
            </Link>
            <BurgerButton isOpen={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} />
          </div>
        </div>
      </header>

      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
}
