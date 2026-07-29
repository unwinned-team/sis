import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createCategory,
  deleteCategory,
  getAllCategories,
  setCategoryArchived,
  updateCategory,
} from '../../api/admin';
import { ImageField } from './ImageField';
import { saveErrorMessage } from './support';
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
import type { Category } from '../../types';

interface CategoryDraft {
  name: string;
  slug: string;
  imageUrl: string;
  tasteLabel: string;
}

const EMPTY_DRAFT: CategoryDraft = {
  name: '',
  slug: '',
  imageUrl: '',
  tasteLabel: '',
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function CategoryForm({
  accessToken,
  draft,
  setDraft,
  onSubmit,
  onCancel,
  isSaving,
  submitLabel,
  formId,
  autoSlug,
}: {
  accessToken: string;
  draft: CategoryDraft;
  setDraft: (draft: CategoryDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  isSaving: boolean;
  submitLabel: string;
  formId: string;
  autoSlug: boolean;
}) {
  const slugInvalid = draft.slug !== '' && !SLUG_PATTERN.test(draft.slug);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-name`} className={LABEL_CLASS}>
            Назва
          </label>
          <input
            id={`${formId}-name`}
            type="text"
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              setDraft(autoSlug ? { ...draft, name, slug: slugify(name) } : { ...draft, name });
            }}
            required
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-slug`} className={LABEL_CLASS}>
            Slug
          </label>
          <input
            id={`${formId}-slug`}
            type="text"
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            required
            className={INPUT_CLASS}
          />
          {slugInvalid && (
            <p className="mt-1 text-xs text-red-500">Лише латиниця, цифри та дефіс.</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`${formId}-taste-label`} className={LABEL_CLASS}>
          Назва характеристики
        </label>
        <input
          id={`${formId}-taste-label`}
          type="text"
          value={draft.tasteLabel}
          onChange={(e) => setDraft({ ...draft, tasteLabel: e.target.value })}
          maxLength={40}
          placeholder="Смак"
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-slate-500">
          Що обирає покупець на картці товару: Смак, Опір, Колір. Порожньо — «Смак».
        </p>
      </div>

      <ImageField
        accessToken={accessToken}
        id={`${formId}-image`}
        value={draft.imageUrl}
        onChange={(url) => setDraft({ ...draft, imageUrl: url })}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isSaving || slugInvalid}
          className={PRIMARY_BUTTON_CLASS}
        >
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

function CategoryCard({
  accessToken,
  category,
  onUpdated,
  onRemoved,
}: {
  accessToken: string;
  category: Category;
  onUpdated: (previousSlug: string, category: Category) => void;
  onRemoved: (slug: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>({
    name: category.name,
    slug: category.slug,
    imageUrl: category.imageUrl ?? '',
    tasteLabel: category.tasteLabel ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [busy, setBusy] = useState<'delete' | 'archive' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const updated = await updateCategory(accessToken, category.slug, {
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        imageUrl: draft.imageUrl.trim() === '' ? null : draft.imageUrl.trim(),
        tasteLabel: draft.tasteLabel.trim() === '' ? null : draft.tasteLabel.trim(),
      });
      onUpdated(category.slug, updated);
      setIsEditing(false);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setInfo(null);
    setBusy('delete');
    try {
      await deleteCategory(accessToken, category.slug);
      onRemoved(category.slug);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleArchived() {
    const next = !category.isArchived;
    setError(null);
    setInfo(null);
    setBusy('archive');
    try {
      const updated = await setCategoryArchived(accessToken, category.slug, next);
      onUpdated(category.slug, updated);
      setInfo(
        next
          ? 'Категорію заархівовано разом з її товарами — на сайті їх більше не видно.'
          : 'Категорію повернуто з архіву; товари, заархівовані окремо, лишились в архіві.',
      );
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className={`${CARD_CLASS} p-5`}>
      {!isEditing && (
        <div className="flex flex-wrap items-center gap-4">
          {category.imageUrl && (
            <img
              src={category.imageUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-2xl border border-white/70 object-cover"
            />
          )}
          <div className="min-w-40 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{category.name}</h3>
              {category.isArchived && (
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                  В архіві
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">/{category.slug}</p>
            {category.tasteLabel && (
              <p className="text-xs text-slate-500">Характеристика: {category.tasteLabel}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
            >
              Редагувати
            </button>
            <button
              type="button"
              onClick={() => void handleToggleArchived()}
              disabled={busy !== null}
              className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
            >
              {busy === 'archive'
                ? '...'
                : category.isArchived
                  ? 'Повернути з архіву'
                  : 'В архів (з товарами)'}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={busy !== null}
              className={DANGER_BUTTON_CLASS}
            >
              {busy === 'delete' ? '...' : 'Видалити'}
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <CategoryForm
          accessToken={accessToken}
          draft={draft}
          setDraft={setDraft}
          onSubmit={(event) => void handleSubmit(event)}
          onCancel={() => {
            setIsEditing(false);
            setError(null);
          }}
          isSaving={isSaving}
          submitLabel="Зберегти"
          formId={`category-${category.id}`}
          autoSlug={false}
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
    </article>
  );
}

export function CategoriesTab({ accessToken }: { accessToken: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CategoryDraft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Как и в ProductsTab: загрузка выводится из ключа запроса, чтобы переключение
  // архива снова показало скелет без каскадного рендера.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = String(showArchived);
  const isLoading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    getAllCategories(accessToken, showArchived)
      .then((loaded) => {
        if (cancelled) return;
        setCategories(loaded);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити категорії.');
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, showArchived, requestKey]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsSaving(true);
    try {
      const trimmedImage = createDraft.imageUrl.trim();
      const created = await createCategory(accessToken, {
        name: createDraft.name.trim(),
        slug: createDraft.slug.trim(),
        imageUrl: trimmedImage === '' ? undefined : trimmedImage,
        tasteLabel: createDraft.tasteLabel.trim() === '' ? null : createDraft.tasteLabel.trim(),
      });
      setCategories((prev) => [...prev, created]);
      setCreateDraft(EMPTY_DRAFT);
      setIsCreating(false);
    } catch (err) {
      setCreateError(saveErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className={`${CARD_CLASS} flex flex-col gap-4 p-5`}>
        <button
          type="button"
          onClick={() => setIsCreating((value) => !value)}
          className={`${PRIMARY_BUTTON_CLASS} self-start`}
        >
          {isCreating ? 'Закрити' : 'Нова категорія'}
        </button>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-white/70"
          />
          Показувати архівні категорії
        </label>

        {isCreating && (
          <div className="border-t border-white/50 pt-4">
            <CategoryForm
              accessToken={accessToken}
              draft={createDraft}
              setDraft={setCreateDraft}
              onSubmit={(event) => void handleCreate(event)}
              isSaving={isSaving}
              submitLabel="Створити"
              formId="category-new"
              autoSlug
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

      {!isLoading && !error && categories.length === 0 && (
        <div className={`${CARD_CLASS} p-6 text-center text-slate-600`}>Категорій ще немає.</div>
      )}

      <div className="flex flex-col gap-4">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            accessToken={accessToken}
            category={category}
            onUpdated={(previousSlug, updated) =>
              setCategories((prev) =>
                prev.map((item) => (item.slug === previousSlug ? updated : item)),
              )
            }
            onRemoved={(slug) =>
              setCategories((prev) => prev.filter((item) => item.slug !== slug))
            }
          />
        ))}
      </div>
    </div>
  );
}
