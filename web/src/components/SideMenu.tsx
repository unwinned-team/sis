import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategories } from '../hooks/useCategories';
import { CategoryPopover } from './CategoryPopover';
import type { Category } from '../types';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOUBLE_CLICK_DELAY_MS = 250;

export function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const { categories, isLoading, error } = useCategories();
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  function handleCategoryClick(category: Category) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onClose();
      navigate(`/category/${category.slug}`);
      return;
    }

    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setActiveCategory(category);
    }, DOUBLE_CLICK_DELAY_MS);
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Меню</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити меню"
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {isLoading && <p className="px-3 py-2 text-sm text-slate-400">Завантаження...</p>}
          {error && <p className="px-3 py-2 text-sm text-red-500">{error}</p>}
          <ul>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => handleCategoryClick(category)}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-slate-700 hover:bg-slate-50"
                >
                  {category.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            title="Скоро"
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-400"
          >
            Вхід
          </button>
          <button
            type="button"
            title="Скоро"
            className="flex-1 rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-400"
          >
            Реєстрація
          </button>
        </div>
      </aside>

      {activeCategory && (
        <CategoryPopover
          key={activeCategory.slug}
          category={activeCategory}
          onClose={() => setActiveCategory(null)}
        />
      )}
    </>
  );
}
