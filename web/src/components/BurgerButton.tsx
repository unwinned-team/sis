import { Menu, X } from 'lucide-react';

interface BurgerButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export function BurgerButton({ isOpen, onClick }: BurgerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? 'Закрити меню' : 'Відкрити меню'}
      aria-expanded={isOpen}
      className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/50 text-slate-700"
    >
      {isOpen ? <X className="h-6 w-6" strokeWidth={1.5} /> : <Menu className="h-6 w-6" strokeWidth={1.5} />}
    </button>
  );
}
