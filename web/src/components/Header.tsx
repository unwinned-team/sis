import { useState } from 'react';
import { Logo } from './Logo';
import { BurgerButton } from './BurgerButton';
import { SideMenu } from './SideMenu';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-[40px_1fr_40px] items-center px-4 py-3 sm:px-6">
        <span aria-hidden="true" />
        <div className="flex justify-center">
          <Logo />
        </div>
        <BurgerButton isOpen={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} />
      </div>

      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </header>
  );
}
