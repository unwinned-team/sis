import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { CategoryPage } from './pages/CategoryPage';
import { ProductPage } from './pages/ProductPage';
import { AuthPage } from './pages/AuthPage';
import { AccountPage } from './pages/AccountPage';
import { RequireRole } from './components/RequireRole';
import { AuthProvider } from './context/AuthProvider';

const AdminPage = lazy(() => import('./pages/admin/AdminPage'));

function AdminRoute() {
  return (
    <RequireRole role="ADMIN">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/60 border-t-teal-400" />
          </div>
        }
      >
        <AdminPage />
      </Suspense>
    </RequireRole>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/admin/:tab" element={<AdminRoute />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
