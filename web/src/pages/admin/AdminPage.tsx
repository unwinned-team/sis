import { Header } from '../../components/Header';
import { BackgroundOrbs } from '../../components/BackgroundOrbs';
import { BackButton } from '../../components/BackButton';
import { useAuth } from '../../hooks/useAuth';
import { OrdersTab } from './OrdersTab';
import { ProductsTab } from './ProductsTab';
import { CategoriesTab } from './CategoriesTab';
import { useNavigate, useParams } from 'react-router-dom';

const TABS = [
  { key: 'orders', label: 'Замовлення' },
  { key: 'products', label: 'Товари' },
  { key: 'categories', label: 'Категорії' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function isTabKey(value: string | undefined): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export function AdminPage() {
  const { accessToken } = useAuth();
  const { tab } = useParams();
  const navigate = useNavigate();

  const active: TabKey = isTabKey(tab) ? tab : 'orders';

  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <BackButton />
        </div>

        <h1 className="heading-glow mb-6 text-center text-2xl font-extrabold sm:text-3xl">
          Панель адміністратора
        </h1>

        <nav className="mb-6 flex flex-wrap justify-center gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(`/admin/${item.key}`)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                active === item.key
                  ? 'bg-[#1b1f3a] text-white shadow-sm'
                  : 'border border-white/70 bg-white/50 text-slate-600 backdrop-blur-sm hover:bg-white/70'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {accessToken && active === 'orders' && <OrdersTab accessToken={accessToken} />}
        {accessToken && active === 'products' && <ProductsTab accessToken={accessToken} />}
        {accessToken && active === 'categories' && <CategoriesTab accessToken={accessToken} />}
      </main>
    </div>
  );
}

export default AdminPage;
