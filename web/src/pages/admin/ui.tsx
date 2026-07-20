import type { ReactNode } from 'react';

export const CARD_CLASS =
  'rounded-3xl border border-white/60 bg-white/40 shadow-lg backdrop-blur-md';

export const INPUT_CLASS =
  'w-full rounded-xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm outline-none backdrop-blur-sm transition focus:border-teal-400 focus:ring-2 focus:ring-teal-300/60';

export const LABEL_CLASS = 'mb-1.5 block text-sm font-semibold text-slate-600';

export const PRIMARY_BUTTON_CLASS =
  'rounded-full bg-[#aee6df] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-[#14403c] shadow-sm transition hover:bg-[#9adfd7] disabled:cursor-not-allowed disabled:opacity-60';

export const GHOST_BUTTON_CLASS =
  'rounded-full border border-white/70 bg-white/50 px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-sm transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60';

export const DANGER_BUTTON_CLASS =
  'rounded-full border border-red-200 bg-red-50/80 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60';

export function Notice({ kind, children }: { kind: 'info' | 'error' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-amber-200 bg-amber-50/80 text-amber-800',
    error: 'border-red-200 bg-red-50/80 text-red-700',
    success: 'border-teal-200 bg-teal-50/80 text-teal-800',
  }[kind];

  return (
    <p className={`rounded-2xl border px-4 py-2.5 text-sm ${styles}`}>{children}</p>
  );
}

export function Skeleton() {
  return (
    <div className={`${CARD_CLASS} animate-pulse p-6`}>
      <div className="h-4 w-40 rounded bg-white/70" />
      <div className="mt-3 h-4 w-full rounded bg-white/60" />
      <div className="mt-2 h-4 w-2/3 rounded bg-white/60" />
    </div>
  );
}
