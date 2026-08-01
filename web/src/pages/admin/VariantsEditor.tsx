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
  description: string;
  price: string;
  imageUrl: string;
}

const EMPTY_DRAFT: Draft = { taste: '', description: '', price: '', imageUrl: '' };

function toInput(draft: Draft) {
  const price = Number(draft.price);
  return {
    taste: draft.taste.trim() === '' ? null : draft.taste.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    price: Number.isNaN(price) ? undefined : price,
    imageUrl: draft.imageUrl === '' ? null : draft.imageUrl,
  };
}

// Назва варіанта з імені файлу: «Vaporesso Xros 5 Black (Чорний).webp» стає
// «Vaporesso Xros 5 Black (Чорний)». Адмін потім може перейменувати.
function variantNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
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
  // Підпис задається в категорії, тому в редакторі показуємо те саме слово,
  // що побачить покупець: «Колір» для pod-систем, «Опір» для картриджів.
  const tasteLabel = product.category?.tasteLabel || 'Смак';
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [descDrafts, setDescDrafts] = useState<Record<string, string>>({});
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // ponytail: єдина ціна на всю линейку — цикл по існуючих PUT-ах варіантів.
  // Bulk-ендпоінт не заводимо: N=5-13, при >50 — замінити на один PATCH.
  const [bulkPrice, setBulkPrice] = useState('');
  const bulkInputRef = useRef<HTMLInputElement>(null);

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
    // price тепер опціональна: порожнє поле = «наслідує ціну товару».
    if (input.price !== undefined && input.price <= 0) {
      setError('Ціна має бути додатним числом.');
      return;
    }
    if (input.taste === null) {
      setError(`Вкажіть «${tasteLabel}».`);
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

  // Фото для варіанта, який ще не створено: вантажимо одразу і тримаємо URL
  // у чернетці, щоб варіант зберігся вже з картинкою.
  async function handleNewImagePick(file: File) {
    setError(null);
    setBusyId('new');
    try {
      const { url } = await uploadImage(accessToken, file);
      setNewDraft((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  // Пачка фото за раз: кожен файл стає окремим варіантом, назва береться з
  // імені файлу. Так 13 кольорів заводяться одним вибором, а не по одному.
  async function handleBulkUpload(files: File[]) {
    const price = Number(newDraft.price === '' ? product.price : newDraft.price);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Вкажіть ціну для нових варіантів.');
      return;
    }

    setError(null);
    setBusyId('bulk');
    const created: ProductVariant[] = [];
    try {
      for (const file of files) {
        const { url } = await uploadImage(accessToken, file);
        created.push(
          await createVariant(accessToken, product.id, {
            taste: variantNameFromFile(file.name),
            price,
            imageUrl: url,
          }),
        );
      }
    } catch (err) {
      handleError(err);
    } finally {
      // Показуємо те, що встигло створитись, навіть якщо частина впала.
      if (created.length > 0) onChanged([...variants, ...created]);
      setBusyId(null);
    }
  }

  // Одна ціна на всю линейку смаків: адмін вводить число раз, ми пробиваємо
  // по всіх варіантах послідовно. Чергу PUT не паралелім — бекенд простий, а
  // частковий фейл легше відтворити станом.
  async function handleApplyPriceToAll() {
    const price = Number(bulkPrice);
    if (Number.isNaN(price) || price <= 0) {
      setError('Ціна має бути додатним числом.');
      return;
    }
    if (variants.length === 0) return;
    setError(null);
    setBusyId('bulk-price');
    const updated: ProductVariant[] = [];
    try {
      for (const v of variants) {
        updated.push(await updateVariant(accessToken, product.id, v.id, { price }));
      }
      onChanged(updated);
      setBulkPrice('');
    } catch (err) {
      handleError(err);
      // Частковий фейл: відтворити те, що встигли, решту лишити як було.
      onChanged(variants.map((v) => updated.find((u) => u.id === v.id) ?? v));
    } finally {
      setBusyId(null);
    }
  }

  // Зберегти всі незбережені правки (ціна + опис) одним кліком — замість
  // ручного «Зберегти» в кожному рядку. Логіка валідації та dirty як у handleSave.
  async function handleSaveAll() {
    const dirty = variants.filter((v) => {
      const d = drafts[v.id];
      const dd = descDrafts[v.id];
      return (
        (d !== undefined && d !== v.price) ||
        (dd !== undefined && dd !== (v.description ?? ''))
      );
    });
    if (dirty.length === 0) return;

    for (const v of dirty) {
      const d = drafts[v.id];
      if (d !== undefined) {
        const price = Number(d);
        if (Number.isNaN(price) || price <= 0) {
          setError(`Ціна для «${[v.taste, v.size].filter(Boolean).join(' · ') || 'Базовий'}» має бути додатним числом.`);
          return;
        }
      }
    }

    setError(null);
    setBusyId('save-all');
    const result: Record<string, ProductVariant> = {};
    const done: string[] = [];
    try {
      for (const v of dirty) {
        const input: VariantInput = {};
        const d = drafts[v.id];
        const dd = descDrafts[v.id];
        if (d !== undefined) input.price = Number(d);
        if (dd !== undefined) input.description = dd.trim() === '' ? null : dd.trim();
        const updated = await updateVariant(accessToken, product.id, v.id, input);
        result[v.id] = updated;
        done.push(v.id);
      }
      onChanged(variants.map((v) => result[v.id] ?? v));
      setDrafts({});
      setDescDrafts({});
    } catch (err) {
      handleError(err);
      // Зберігаємо те, що встигли; решта drafts лишаємо, щоб адмін доробив.
      const savedResult = variants.map((v) => result[v.id] ?? v);
      onChanged(savedResult);
      const remainingDrafts: Record<string, string> = {};
      const remainingDesc: Record<string, string> = {};
      for (const v of dirty) {
        if (!done.includes(v.id)) {
          const d = drafts[v.id];
          const dd = descDrafts[v.id];
          if (d !== undefined) remainingDrafts[v.id] = d;
          if (dd !== undefined) remainingDesc[v.id] = dd;
        }
      }
      setDrafts(remainingDrafts);
      setDescDrafts(remainingDesc);
    } finally {
      setBusyId(null);
    }
  }

  const hasDirty = variants.some((v) => {
    const d = drafts[v.id];
    const dd = descDrafts[v.id];
    return (
      (d !== undefined && d !== v.price) ||
      (dd !== undefined && dd !== (v.description ?? ''))
    );
  });

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
        <VariantImage
          imageUrl={newDraft.imageUrl}
          disabled={busyId !== null || unsupported}
          onPick={(file) => void handleNewImagePick(file)}
          onClear={() => setNewDraft((prev) => ({ ...prev, imageUrl: '' }))}
        />
        <input
          type="text"
          value={newDraft.taste}
          onChange={(e) => setNewDraft((prev) => ({ ...prev, taste: e.target.value }))}
          placeholder={tasteLabel}
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

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={bulkInputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void handleBulkUpload(files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => bulkInputRef.current?.click()}
          disabled={busyId !== null || unsupported}
          className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
        >
          {busyId === 'bulk' ? 'Завантаження...' : 'Завантажити кілька фото'}
        </button>
        <span className="text-xs text-slate-500">
          Кожне фото стане окремим варіантом, назву візьмемо з імені файлу. Ціна з поля вище, або
          ціна товару.
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={bulkPrice}
          onChange={(e) => setBulkPrice(e.target.value)}
          placeholder="Єдина ціна для всіх смаків"
          disabled={busyId !== null || unsupported || variants.length === 0}
          className={`${INPUT_CLASS} !w-56`}
        />
        <button
          type="button"
          onClick={() => void handleApplyPriceToAll()}
          disabled={busyId !== null || unsupported || variants.length === 0}
          className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
        >
          {busyId === 'bulk-price' ? 'Застосовуємо…' : 'Застосувати ціну до всіх смаків'}
        </button>
        <span className="text-xs text-slate-500">
          Перезапише ціну всіх варіантів одним значенням.
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={!hasDirty || busyId !== null || unsupported || variants.length === 0}
          className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
        >
          {busyId === 'save-all' ? 'Зберігаємо…' : 'Зберегти всі зміни смаків'}
        </button>
        <span className="text-xs text-slate-500">
          Зберігає незбережені ціни та описи всіх рядків одним кліком.
        </span>
      </div>
    </div>
  );
}
