import type { ReactNode } from 'react';

import { CARD_CLASS } from './classes';

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