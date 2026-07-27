import { useRef, useState } from 'react';
import {
  createVariant,
  deleteVariant,
  updateVariant,
  uploadImage,
  type VariantInput,
} from '../../api/admin';
import { isMissingEndpoint, saveErrorMessage } from './support';
import { DANGER_BUTTON_CLASS, GHOST_BUTTON_CLASS, INPUT_CLASS, Notice } from './ui';
import type { Product, ProductVariant } from '../../types';

// Фото смаку редагується прямо в рядку: клік по мініатюрі відкриває вибір файлу,
// завантаження одразу зберігається — окрема форма заради одного поля зайва.
function VariantImage({
  imageUrl,
  disabled,
  onPick,
  onClear,
}: {
  imageUrl: string | null | undefined;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title={imageUrl ? 'Змінити фото смаку' : 'Додати фото смаку'}
        className="h-11 w-11 overflow-hidden rounded-xl border border-white/70 bg-white/50 text-lg text-slate-400 transition hover:border-teal-300 hover:text-teal-600 disabled:opacity-50"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          '＋'
        )}
      </button>
      {imageUrl && !disabled && (
        <button
          type="button"
          onClick={onClear}
          title="Прибрати фото смаку"
          className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border border-white bg-slate-700 text-xs leading-none text-white"
        >
          ×
        </button>
      )}
    </div>
  );
}

interface Draft {
  taste: string;
  size: string;
  description: string;
  price: string;
}

const EMPTY_DRAFT: Draft = { taste: '', size: '', description: '', price: '' };

function toInput(draft: Draft) {
  const price = Number(draft.price);
  return {
    taste: draft.taste.trim() === '' ? null : draft.taste.trim(),
    size: draft.size.trim() === '' ? null : draft.size.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
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
  const [descDrafts, setDescDrafts] = useState<Record<string, string>>({});
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

  async function handleSave(variant: ProductVariant) {
    const priceRaw = drafts[variant.id];
    const descRaw = descDrafts[variant.id];
    const input: VariantInput = {};
    if (priceRaw !== undefined) {
      const price = Number(priceRaw);
      if (Number.isNaN(price) || price <= 0) {
        setError('Ціна має бути додатним числом.');
        return;
      }
      input.price = price;
    }
    if (descRaw !== undefined) {
      input.description = descRaw.trim() === '' ? null : descRaw.trim();
    }
    if (Object.keys(input).length === 0) return;

    setError(null);
    setBusyId(variant.id);
    try {
      const updated = await updateVariant(accessToken, product.id, variant.id, input);
      onChanged(variants.map((item) => (item.id === variant.id ? updated : item)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[variant.id];
        return next;
      });
      setDescDrafts((prev) => {
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

  async function patchVariant(variant: ProductVariant, input: VariantInput) {
    setError(null);
    setBusyId(variant.id);
    try {
      const updated = await updateVariant(accessToken, product.id, variant.id, input);
      onChanged(variants.map((item) => (item.id === variant.id ? updated : item)));
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleImagePick(variant: ProductVariant, file: File) {
    setError(null);
    setBusyId(variant.id);
    try {
      const { url } = await uploadImage(accessToken, file);
      await patchVariant(variant, { imageUrl: url });
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  function handleToggleAvailable(variant: ProductVariant) {
    return patchVariant(variant, { isAvailable: !variant.isAvailable });
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
          const descDraft = descDrafts[variant.id];
          const isDirty =
            (draft !== undefined && draft !== variant.price) ||
            (descDraft !== undefined && descDraft !== (variant.description ?? ''));
          return (
            <li key={variant.id} className="flex flex-wrap items-center gap-2">
              <VariantImage
                imageUrl={variant.imageUrl}
                disabled={busyId !== null || unsupported}
                onPick={(file) => void handleImagePick(variant, file)}
                onClear={() => void patchVariant(variant, { imageUrl: null })}
              />
              <span
                className={`min-w-32 flex-1 text-sm ${
                  variant.isAvailable ? 'text-slate-700' : 'text-slate-400 line-through'
                }`}
              >
                {[variant.taste, variant.size].filter(Boolean).join(' · ') || 'Базовий'}
              </span>
              <button
                type="button"
                onClick={() => void handleToggleAvailable(variant)}
                disabled={busyId !== null || unsupported}
                aria-pressed={variant.isAvailable}
                title="Клікніть, щоб змінити доступність смаку"
                className={`!px-3 !py-1.5 !text-xs ${
                  variant.isAvailable
                    ? 'rounded-full border border-emerald-300 bg-emerald-50 font-semibold text-emerald-700'
                    : GHOST_BUTTON_CLASS
                }`}
              >
                {busyId === variant.id ? '...' : variant.isAvailable ? '✓ Доступний' : 'Недоступний'}
              </button>
              <input
                type="text"
                value={descDraft ?? variant.description ?? ''}
                onChange={(e) =>
                  setDescDrafts((prev) => ({ ...prev, [variant.id]: e.target.value }))
                }
                placeholder="Опис"
                disabled={unsupported}
                className={`${INPUT_CLASS} !w-48`}
              />
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
                onClick={() => void handleSave(variant)}
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
          type="text"
          value={newDraft.description}
          onChange={(e) => setNewDraft((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Опис"
          disabled={unsupported}
          className={`${INPUT_CLASS} !w-48`}
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
