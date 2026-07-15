import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { CategoryPage } from './pages/CategoryPage';
import { ComingSoonPage } from './pages/ComingSoonPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/category/:slug" element={<CategoryPage />} />
        <Route path="/product/:id" element={<ComingSoonPage title="Товар" />} />
        <Route path="/account" element={<ComingSoonPage title="Особистий кабінет" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
