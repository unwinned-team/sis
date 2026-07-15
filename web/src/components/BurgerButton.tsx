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
      className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg transition-colors hover:bg-white/50"
    >
      <span
        className={`block h-0.5 w-6 bg-slate-900 transition-transform ${
          isOpen ? 'translate-y-2 rotate-45' : ''
        }`}
      />
      <span
        className={`block h-0.5 w-6 bg-slate-900 transition-opacity ${
          isOpen ? 'opacity-0' : ''
        }`}
      />
      <span
        className={`block h-0.5 w-6 bg-slate-900 transition-transform ${
          isOpen ? '-translate-y-2 -rotate-45' : ''
        }`}
      />
    </button>
  );
}
