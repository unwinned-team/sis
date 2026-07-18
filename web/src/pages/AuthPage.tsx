import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { BackgroundOrbs } from '../components/BackgroundOrbs';
import { BackButton } from '../components/BackButton';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';

type AuthMode = 'login' | 'register';

const INPUT_CLASS =
  'w-full rounded-xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition focus:border-teal-400 focus:ring-2 focus:ring-teal-300/60';

const LABEL_CLASS = 'mb-1.5 block text-sm font-semibold text-slate-600';

function errorMessage(err: unknown, mode: AuthMode): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Невірний email або пароль.';
    if (err.status === 409) return 'Користувач із таким email вже існує.';
    if (err.status === 400) return 'Перевірте правильність введених даних.';
  }
  return mode === 'login'
    ? 'Не вдалося увійти. Спробуйте ще раз.'
    : 'Не вдалося зареєструватися. Спробуйте ще раз.';
}

export function AuthPage() {
  const { user, isReady, login, register } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode: AuthMode = searchParams.get('mode') === 'register' ? 'register' : 'login';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isReady && user) {
    return <Navigate to="/" replace />;
  }

  function switchMode(next: AuthMode) {
    setError(null);
    setSearchParams(next === 'login' ? {} : { mode: next }, { replace: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name.trim(), email, password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, mode));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <BackgroundOrbs />
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <BackButton />
        </div>

        <section className="mx-auto w-full max-w-md rounded-3xl border border-white/60 bg-white/40 p-6 shadow-lg backdrop-blur-md sm:p-8">
          <h1 className="heading-glow mb-6 text-center text-2xl font-extrabold sm:text-3xl">
            {mode === 'login' ? 'Вхід' : 'Реєстрація'}
          </h1>

          <div className="mb-6 flex rounded-full border border-white/60 bg-white/40 p-1 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => switchMode('login')}
              aria-pressed={mode === 'login'}
              className={
                mode === 'login'
                  ? 'flex-1 rounded-full bg-teal-500/90 py-2 text-sm font-semibold text-white shadow-sm'
                  : 'flex-1 rounded-full py-2 text-sm font-medium text-slate-600 transition hover:bg-white/60'
              }
            >
              Вхід
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              aria-pressed={mode === 'register'}
              className={
                mode === 'register'
                  ? 'flex-1 rounded-full bg-teal-500/90 py-2 text-sm font-semibold text-white shadow-sm'
                  : 'flex-1 rounded-full py-2 text-sm font-medium text-slate-600 transition hover:bg-white/60'
              }
            >
              Реєстрація
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className={LABEL_CLASS}>
                  Ім'я
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                  autoComplete="name"
                  placeholder="Ваше ім'я"
                  className={INPUT_CLASS}
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className={LABEL_CLASS}>
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="auth-password" className={LABEL_CLASS}>
                Пароль
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : 1}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'Мінімум 8 символів' : 'Ваш пароль'}
                className={INPUT_CLASS}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 rounded-full bg-[#aee6df] py-2.5 text-sm font-bold uppercase tracking-wide text-[#14403c] shadow-sm transition hover:bg-[#9adfd7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? 'Зачекайте...'
                : mode === 'login'
                  ? 'Увійти'
                  : 'Створити акаунт'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === 'login' ? (
              <>
                Немає акаунта?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-semibold text-teal-700 underline-offset-2 hover:underline"
                >
                  Зареєструватися
                </button>
              </>
            ) : (
              <>
                Вже є акаунт?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-teal-700 underline-offset-2 hover:underline"
                >
                  Увійти
                </button>
              </>
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
