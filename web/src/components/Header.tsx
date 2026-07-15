import { useState } from 'react';
import { Logo } from './Logo';
import { BurgerButton } from './BurgerButton';
import { SideMenu } from './SideMenu';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <header className="liquid-glass sticky top-0 z-30">
        <div className="grid grid-cols-[40px_1fr_40px] items-center px-3 py-3 sm:px-4">
          <span aria-hidden="true" />
          <div className="flex justify-center">
            <Logo />
          </div>
          <BurgerButton isOpen={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} />
        </div>
      </header>

      {/* Rendered outside <header>: its backdrop-filter would trap fixed descendants */}
      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
}
