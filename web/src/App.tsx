import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { CategoryPage } from './pages/CategoryPage';
import { ProductPage } from './pages/ProductPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { AuthPage } from './pages/AuthPage';
import { AuthProvider } from './context/AuthProvider';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<ComingSoonPage title="Особистий кабінет" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
