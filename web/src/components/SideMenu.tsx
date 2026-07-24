import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../hooks/useAuth';
import { MegaMenu } from './MegaMenu';
import type { Category } from '../types';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOUBLE_CLICK_DELAY_MS = 250;

export function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const { categories, isLoading, error } = useCategories();
  const { user, logout } = useAuth();
  const [hoveredCategory, setHoveredCategory] = useState<Category | null>(null);
  const [hoverOffset, setHoverOffset] = useState<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  function handleCategoryClick(category: Category) {
    onClose();
    navigate(`/category/${category.slug}`);
  }

  function handleMouseEnter(category: Category, e?: React.MouseEvent) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const offset = e ? e.currentTarget.getBoundingClientRect().top : null;
    hoverTimer.current = setTimeout(() => {
      setHoveredCategory(category);
      if (offset !== null) setHoverOffset(offset);
    }, 300);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setHoveredCategory(null);
    }, 300);
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
        className={`liquid-glass-panel fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-white/40 px-5 py-4">
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
                  onMouseEnter={(e) => handleMouseEnter(category, e)}
                  onMouseLeave={handleMouseLeave}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-slate-700 transition hover:bg-white/60"
                >
                  {category.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-white/40 p-4">
          {user ? (
            <div className="flex flex-col gap-2">
              <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
              {user.email && <p className="truncate text-xs text-slate-500">{user.email}</p>}
              <Link
                to="/account"
                onClick={onClose}
                className="mt-1 rounded-lg border border-white/60 bg-white/30 py-2 text-center text-sm font-medium text-slate-700 backdrop-blur-sm transition hover:bg-white/50"
              >
                Особистий кабінет
              </Link>
              {user.role === 'ADMIN' && (
                <Link
                  to="/admin"
                  onClick={onClose}
                  className="rounded-lg border border-white/60 bg-white/30 py-2 text-center text-sm font-medium text-slate-700 backdrop-blur-sm transition hover:bg-white/50"
                >
                  Панель адміністратора
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void logout();
                }}
                className="mt-1 rounded-lg bg-white/60 py-2 text-sm font-medium text-slate-700 transition hover:bg-white/80"
              >
                Вийти
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link
                to="/auth"
                onClick={onClose}
                className="flex-1 rounded-lg border border-white/60 bg-white/30 py-2 text-center text-sm font-medium text-slate-700 backdrop-blur-sm transition hover:bg-white/50"
              >
                Вхід
              </Link>
              <Link
                to="/auth?mode=register"
                onClick={onClose}
                className="flex-1 rounded-lg bg-white/60 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-white/80"
              >
                Реєстрація
              </Link>
            </div>
          )}
        </div>
      </aside>

      {hoveredCategory && (
        <MegaMenu
          key={hoveredCategory.slug}
          category={hoveredCategory}
          onMouseEnter={() => handleMouseEnter(hoveredCategory)}
          onMouseLeave={handleMouseLeave}
          topOffset={hoverOffset}
        />
      )}
    </>
  );
}
