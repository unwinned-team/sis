import { useState } from 'react';
import { createVariant, deleteVariant, updateVariant } from '../../api/admin';
import { isMissingEndpoint, saveErrorMessage } from './support';
import { DANGER_BUTTON_CLASS, GHOST_BUTTON_CLASS, INPUT_CLASS, Notice } from './ui';
import type { Product, ProductVariant } from '../../types';

interface Draft {
  taste: string;
  size: string;
  price: string;
}

const EMPTY_DRAFT: Draft = { taste: '', size: '', price: '' };

function toInput(draft: Draft) {
  const price = Number(draft.price);
  return {
    taste: draft.taste.trim() === '' ? null : draft.taste.trim(),
    size: draft.size.trim() === '' ? null : draft.size.trim(),
    price: Number.isNaN(price) ? undefined : price,
  };
}

export function VariantsEditor({
  accessToken,
  product,
  onChanged,
}: {
  accessToken: string;
  product: Product;
  onChanged: (variants: ProductVariant[]) => void;
}) {
  const variants = product.variants ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function handleError(err: unknown) {
    if (isMissingEndpoint(err)) {
      setUnsupported(true);
      setError(null);
      return;
    }
    setError(saveErrorMessage(err));
  }

  async function handleSavePrice(variant: ProductVariant) {
    const raw = drafts[variant.id];
    if (raw === undefined) return;
    const price = Number(raw);
    if (Number.isNaN(price) || price <= 0) {
      setError('Ціна має бути додатним числом.');
      return;
    }

    setError(null);
    setBusyId(variant.id);
    try {
      const updated = await updateVariant(accessToken, product.id, variant.id, { price });
      onChanged(variants.map((item) => (item.id === variant.id ? updated : item)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[variant.id];
        return next;
      });
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(variant: ProductVariant) {
    setError(null);
    setBusyId(variant.id);
    try {
      await deleteVariant(accessToken, product.id, variant.id);
      onChanged(variants.filter((item) => item.id !== variant.id));
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate() {
    const input = toInput(newDraft);
    if (input.price === undefined || input.price <= 0) {
      setError('Ціна має бути додатним числом.');
      return;
    }
    if (input.taste === null && input.size === null) {
      setError('Вкажіть смак або об’єм.');
      return;
    }

    setError(null);
    setBusyId('new');
    try {
      const created = await createVariant(accessToken, product.id, input);
      onChanged([...variants, created]);
      setNewDraft(EMPTY_DRAFT);
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-4 border-t border-white/50 pt-4">
      <p className="mb-3 text-sm font-semibold text-slate-700">Варіанти</p>

      {unsupported && (
        <Notice kind="info">
          CRUD варіантів ще не реалізований на бекенді (ADMIN.md §2) — варіанти живуть лише в сіді.
        </Notice>
      )}

      {error && (
        <div className="mb-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {variants.length === 0 && !unsupported && (
        <p className="mb-3 text-sm text-slate-500">У товару немає варіантів.</p>
      )}

      <ul className="flex flex-col gap-2">
        {variants.map((variant) => {
          const draft = drafts[variant.id];
          const isDirty = draft !== undefined && draft !== variant.price;
          return (
            <li key={variant.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-32 flex-1 text-sm text-slate-700">
                {[variant.taste, variant.size].filter(Boolean).join(' · ') || 'Базовий'}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft ?? variant.price}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [variant.id]: e.target.value }))
                }
                disabled={unsupported}
                className={`${INPUT_CLASS} !w-28`}
              />
              <button
                type="button"
                onClick={() => void handleSavePrice(variant)}
                disabled={!isDirty || busyId !== null || unsupported}
                className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
              >
                {busyId === variant.id ? '...' : 'Зберегти'}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(variant)}
                disabled={busyId !== null || unsupported}
                className={DANGER_BUTTON_CLASS}
              >
                Видалити
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newDraft.taste}
          onChange={(e) => setNewDraft((prev) => ({ ...prev, taste: e.target.value }))}
          placeholder="Смак"
          disabled={unsupported}
          className={`${INPUT_CLASS} !w-32`}
        />
        <input
          type="text"
          value={newDraft.size}
          onChange={(e) => setNewDraft((prev) => ({ ...prev, size: e.target.value }))}
          placeholder="Об’єм"
          disabled={unsupported}
          className={`${INPUT_CLASS} !w-32`}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={newDraft.price}
          onChange={(e) => setNewDraft((prev) => ({ ...prev, price: e.target.value }))}
          placeholder="Ціна"
          disabled={unsupported}
          className={`${INPUT_CLASS} !w-28`}
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={busyId !== null || unsupported}
          className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
        >
          {busyId === 'new' ? '...' : 'Додати варіант'}
        </button>
      </div>
    </div>
  );
}
