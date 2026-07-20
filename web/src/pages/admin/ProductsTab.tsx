import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createProduct,
  deleteProduct,
  getAllProducts,
  setProductArchived,
  updateProduct,
} from '../../api/admin';
import { getCategories } from '../../api/categories';
import { formatPrice } from '../../utils/format';
import { ImageField } from './ImageField';
import { VariantsEditor } from './VariantsEditor';
import { saveErrorMessage, supportsAvailability } from './support';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  Notice,
  PRIMARY_BUTTON_CLASS,
  Skeleton,
} from './ui';
import type { Category, Product, ProductVariant } from '../../types';

interface ProductDraft {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  imageUrl: '',
};

function toDraft(product: Product): ProductDraft {
  return {
    name: product.name,
    description: product.description,
    price: product.price,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
  };
}

function ProductForm({
  accessToken,
  categories,
  draft,
  setDraft,
  onSubmit,
  onCancel,
  isSaving,
  submitLabel,
  formId,
}: {
  accessToken: string;
  categories: Category[];
  draft: ProductDraft;
  setDraft: (draft: ProductDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  isSaving: boolean;
  submitLabel: string;
  formId: string;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${formId}-name`} className={LABEL_CLASS}>
          Назва
        </label>
        <input
          id={`${formId}-name`}
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          required
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor={`${formId}-description`} className={LABEL_CLASS}>
          Опис
        </label>
        <textarea
          id={`${formId}-description`}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          required
          rows={3}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-price`} className={LABEL_CLASS}>
            Ціна
          </label>
          <input
            id={`${formId}-price`}
            type="number"
            step="0.01"
            min="0.01"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            required
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-category`} className={LABEL_CLASS}>
            Категорія
          </label>
          <select
            id={`${formId}-category`}
            value={draft.categoryId}
            onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            required
            className={INPUT_CLASS}
          >
            <option value="">Оберіть категорію</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ImageField
        accessToken={accessToken}
        id={`${formId}-image`}
        value={draft.imageUrl}
        onChange={(url) => setDraft({ ...draft, imageUrl: url })}
      />

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
          {isSaving ? 'Зачекайте...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={GHOST_BUTTON_CLASS}>
            Скасувати
          </button>
        )}
      </div>
    </form>
  );
}

function ProductCard({
  accessToken,
  product,
  categories,
  availabilitySupported,
  onUpdated,
  onRemoved,
}: {
  accessToken: string;
  product: Product;
  categories: Category[];
  availabilitySupported: boolean;
  onUpdated: (product: Product) => void;
  onRemoved: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(() => toDraft(product));
  const [isSaving, setIsSaving] = useState(false);
  const [busy, setBusy] = useState<'availability' | 'delete' | 'archive' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const updated = await updateProduct(accessToken, product.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        price: Number(draft.price),
        categoryId: draft.categoryId,
        imageUrl: draft.imageUrl.trim(),
      });
      onUpdated({ ...product, ...updated });
      setIsEditing(false);
    } catch (err) {
      setError(saveErrorMessage(err, draft.imageUrl));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleAvailability() {
    setError(null);
    setInfo(null);
    setBusy('availability');
    try {
      const next = !(product.isAvailable ?? true);
      const updated = await updateProduct(accessToken, product.id, { isAvailable: next });
      if (updated.isAvailable === undefined) {
        setInfo(
          'Сервер прийняв запит, але поле isAvailable ще не існує (ADMIN.md §1) — наявність не змінилась.',
        );
        return;
      }
      onUpdated({ ...product, ...updated });
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setError(null);
    setInfo(null);
    setBusy('delete');
    try {
      const outcome = await deleteProduct(accessToken, product.id);
      if (outcome === 'archived') {
        onUpdated({ ...product, isArchived: true });
        setInfo('Товар заархівовано — він має історію замовлень.');
        return;
      }
      onRemoved(product.id);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleUnarchive() {
    setError(null);
    setInfo(null);
    setBusy('archive');
    try {
      const updated = await setProductArchived(accessToken, product.id, false);
      onUpdated({ ...product, ...updated });
      setInfo('Товар повернуто з архіву.');
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const isAvailable = product.isAvailable ?? true;

  return (
    <article className={`${CARD_CLASS} p-5`}>
      {!isEditing && (
        <>
          <div className="flex flex-wrap items-start gap-4">
            <img
              src={product.imageUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-2xl border border-white/70 object-cover"
            />
            <div className="min-w-48 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{product.name}</h3>
                {product.isArchived && (
                  <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                    В архіві
                  </span>
                )}
                {availabilitySupported && !isAvailable && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                    Немає в наявності
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{product.description}</p>
              <p className="mt-1 text-sm font-bold text-teal-700">{formatPrice(product.price)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(toDraft(product));
                setIsEditing(true);
              }}
              className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
            >
              Редагувати
            </button>
            <button
              type="button"
              onClick={() => void handleToggleAvailability()}
              disabled={busy !== null}
              className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
            >
              {busy === 'availability'
                ? '...'
                : isAvailable
                  ? 'Позначити «немає»'
                  : 'Позначити «в наявності»'}
            </button>
            {product.isArchived ? (
              <button
                type="button"
                onClick={() => void handleUnarchive()}
                disabled={busy !== null}
                className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
              >
                {busy === 'archive' ? '...' : 'Повернути з архіву'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy !== null}
                className={DANGER_BUTTON_CLASS}
              >
                {busy === 'delete' ? '...' : 'Видалити'}
              </button>
            )}
          </div>
        </>
      )}

      {isEditing && (
        <ProductForm
          accessToken={accessToken}
          categories={categories}
          draft={draft}
          setDraft={setDraft}
          onSubmit={(event) => void handleSubmit(event)}
          onCancel={() => {
            setIsEditing(false);
            setError(null);
          }}
          isSaving={isSaving}
          submitLabel="Зберегти"
          formId={`product-${product.id}`}
        />
      )}

      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {info && (
        <div className="mt-3">
          <Notice kind="info">{info}</Notice>
        </div>
      )}

      <VariantsEditor
        accessToken={accessToken}
        product={product}
        onChanged={(variants: ProductVariant[]) => onUpdated({ ...product, variants })}
      />
    </article>
  );
}

export function ProductsTab({ accessToken }: { accessToken: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Загрузка выводится из ключа запроса, а не отдельным setState в эффекте:
  // переключение архива снова показывает скелет, но без каскадного рендера.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = String(showArchived);
  const isLoading = loadedKey !== requestKey;

  const [isCreating, setIsCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAllProducts(accessToken, showArchived), getCategories()])
      .then(([loadedProducts, loadedCategories]) => {
        if (cancelled) return;
        setProducts(loadedProducts);
        setCategories(loadedCategories);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити товари.');
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, showArchived, requestKey]);

  const availabilitySupported = useMemo(() => supportsAvailability(products), [products]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryFilter && product.categoryId !== categoryFilter) return false;
      if (query && !product.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [products, search, categoryFilter]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsSaving(true);
    try {
      const created = await createProduct(accessToken, {
        name: createDraft.name.trim(),
        description: createDraft.description.trim(),
        price: Number(createDraft.price),
        categoryId: createDraft.categoryId,
        imageUrl: createDraft.imageUrl.trim(),
      });
      setProducts((prev) => [created, ...prev]);
      setCreateDraft(EMPTY_DRAFT);
      setIsCreating(false);
    } catch (err) {
      setCreateError(saveErrorMessage(err, createDraft.imageUrl));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {!isLoading && !availabilitySupported && (
        <Notice kind="info">
          Поля <code>isAvailable</code>/<code>isArchived</code> ще не додані в схему (ADMIN.md §1) —
          кнопка наявності та архівування спрацюють після міграції.
        </Notice>
      )}

      <section className={`${CARD_CLASS} flex flex-col gap-4 p-5`}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за назвою"
            className={INPUT_CLASS}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Усі категорії</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setIsCreating((value) => !value)}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isCreating ? 'Закрити' : 'Новий товар'}
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-white/70"
          />
          Показувати архівні товари
        </label>

        {isCreating && (
          <div className="border-t border-white/50 pt-4">
            <ProductForm
              accessToken={accessToken}
              categories={categories}
              draft={createDraft}
              setDraft={setCreateDraft}
              onSubmit={(event) => void handleCreate(event)}
              isSaving={isSaving}
              submitLabel="Створити"
              formId="product-new"
            />
            {createError && (
              <div className="mt-3">
                <Notice kind="error">{createError}</Notice>
              </div>
            )}
          </div>
        )}
      </section>

      {error && <Notice kind="error">{error}</Notice>}
      {isLoading && <Skeleton />}

      {!isLoading && !error && visible.length === 0 && (
        <div className={`${CARD_CLASS} p-6 text-center text-slate-600`}>Товарів не знайдено.</div>
      )}

      <div className="flex flex-col gap-4">
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            accessToken={accessToken}
            product={product}
            categories={categories}
            availabilitySupported={availabilitySupported}
            onUpdated={(updated) =>
              setProducts((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
            onRemoved={(id) => setProducts((prev) => prev.filter((item) => item.id !== id))}
          />
        ))}
      </div>
    </div>
  );
}
