import { useLayoutEffect, useRef, useState } from 'react';

const COOKIE = 'age_verified=1';
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function hasAgeCookie(): boolean {
  return document.cookie.split('; ').includes(COOKIE);
}

export function AgeGate() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(() => !hasAgeCookie());

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function accept() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}; Max-Age=${THIRTY_DAYS_SECONDS}; Path=/; SameSite=Lax${secure}`;
    setIsOpen(false);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="age-gate-title"
      className="age-gate mx-auto my-auto w-full max-w-lg bg-transparent p-4"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="rounded-3xl border border-white/70 bg-white px-6 py-8 text-center shadow-2xl sm:px-10 sm:py-10">
        <h1 id="age-gate-title" className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Підтвердження віку
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
          Цей вебсайт призначений виключно для осіб, які досягли 18 років. Натискаючи кнопку
          «ТАК, мені є 18», ви підтверджуєте, що вам виповнилось 18 років.
        </p>
        <button
          type="button"
          autoFocus
          onClick={accept}
          className="mt-7 w-full rounded-full bg-teal-500 px-6 py-4 text-lg font-extrabold text-slate-950 shadow-lg transition hover:bg-teal-400 focus:outline-none focus:ring-4 focus:ring-teal-300"
        >
          ТАК, мені є 18
        </button>
        <button
          type="button"
          onClick={() => window.location.replace('https://www.google.com/')}
          className="mt-3 px-5 py-2 text-sm font-semibold text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          НІ
        </button>
      </div>
    </dialog>
  );
}
