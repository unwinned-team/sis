import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createBanner,
  deleteBanner,
  getAllBanners,
  reorderBanners,
  updateBanner,
} from '../../api/admin';
import { ImageField } from './ImageField';
import { saveErrorMessage } from './support';
import { Notice, Skeleton } from './ui';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  dirtyInputClass,
  GHOST_BUTTON_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
} from './classes';
import type { Banner } from '../../types';

const LINK_HINT =
  'Порожньо - банер проста картинка. Якщо хочете зробити с переходом на категорію, або товар: /category/<slug>, /product/<id>, /search?... або https://..., ну ви поняли крч';

function LinkField({
  id,
  value,
  onChange,
  dirty,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  dirty?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        Посилання
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/category/tobacco"
        className={`${INPUT_CLASS} ${dirtyInputClass(dirty ?? false)}`}
      />
      <p className="mt-1 text-xs text-slate-500">{LINK_HINT}</p>
    </div>
  );
}

function BannerCard({
  accessToken,
  banner,
  isFirst,
  isLast,
  onUpdated,
  onRemoved,
  onMove,
}: {
  accessToken: string;
  banner: Banner;
  isFirst: boolean;
  isLast: boolean;
  onUpdated: (banner: Banner) => void;
  onRemoved: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [imageUrl, setImageUrl] = useState(banner.imageUrl);
  const [link, setLink] = useState(banner.link ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [busy, setBusy] = useState<'delete' | 'active' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const trimmedLink = link.trim();
      const updated = await updateBanner(accessToken, banner.id, {
        imageUrl: imageUrl.trim(),
        link: trimmedLink === '' ? null : trimmedLink,
      });
      onUpdated(updated);
      setIsEditing(false);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    setError(null);
    setBusy('active');
    try {
      onUpdated(await updateBanner(accessToken, banner.id, { isActive: !banner.isActive }));
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setError(null);
    setBusy('delete');
    try {
      await deleteBanner(accessToken, banner.id);
      onRemoved(banner.id);
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
          <img
            src={banner.imageUrl}
            alt=""
            className="h-16 w-28 shrink-0 rounded-xl border border-white/70 object-cover"
          />
          <div className="min-w-40 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-900">#{banner.sortOrder + 1}</span>
              {!banner.isActive && (
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                  Прихований
                </span>
              )}
            </div>
            <p className="text-sm break-all text-slate-500">{banner.link ?? 'Без посилання'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-label="Підняти вище"
              onClick={() => onMove(banner.id, -1)}
              disabled={isFirst}
              className={`${GHOST_BUTTON_CLASS} !px-3 !py-1.5 !text-xs`}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Опустити нижче"
              onClick={() => onMove(banner.id, 1)}
              disabled={isLast}
              className={`${GHOST_BUTTON_CLASS} !px-3 !py-1.5 !text-xs`}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
            >
              Редагувати
            </button>
            <button
              type="button"
              onClick={() => void handleToggleActive()}
              disabled={busy !== null}
              className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
            >
              {busy === 'active' ? '...' : banner.isActive ? 'Сховати' : 'Показати'}
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
        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <ImageField
            accessToken={accessToken}
            id={`banner-${banner.id}-image`}
            value={imageUrl}
            onChange={setImageUrl}
            dirty={imageUrl !== banner.imageUrl}
          />
          <LinkField
            id={`banner-${banner.id}-link`}
            value={link}
            onChange={setLink}
            dirty={link !== (banner.link ?? '')}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving || imageUrl.trim() === ''}
              className={PRIMARY_BUTTON_CLASS}
            >
              {isSaving ? 'Зачекайте...' : 'Зберегти'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setImageUrl(banner.imageUrl);
                setLink(banner.link ?? '');
                setError(null);
              }}
              className={GHOST_BUTTON_CLASS}
            >
              Скасувати
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </article>
  );
}

export function BannersTab({ accessToken }: { accessToken: string }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draftImage, setDraftImage] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllBanners(accessToken)
      .then((loaded) => {
        if (!cancelled) setBanners(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалося завантажити банери.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsSaving(true);
    try {
      const trimmedLink = draftLink.trim();
      const created = await createBanner(accessToken, {
        imageUrl: draftImage.trim(),
        link: trimmedLink === '' ? null : trimmedLink,
        // В конец карусели, иначе новый банер садится на sortOrder 0 к первому.
        sortOrder: banners.length,
      });
      setBanners((prev) => [...prev, created]);
      setDraftImage('');
      setDraftLink('');
      setIsCreating(false);
    } catch (err) {
      setCreateError(saveErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  // Порядок меняем оптимистично: ждать ответ на каждую стрелку это заметный
  // лаг. При ошибке откатываем к прошлому списку.
  async function handleMove(id: string, direction: -1 | 1) {
    const index = banners.findIndex((banner) => banner.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= banners.length) return;

    const previous = banners;
    const next = [...banners];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setBanners(next.map((banner, position) => ({ ...banner, sortOrder: position })));
    setError(null);

    try {
      await reorderBanners(
        accessToken,
        next.map((banner) => banner.id),
      );
    } catch (err) {
      setBanners(previous);
      setError(saveErrorMessage(err));
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
          {isCreating ? 'Закрити' : 'Новий банер'}
        </button>

        <p className="text-sm text-slate-500">
          Банери показуються каруселлю над категоріями на головній. Порядок — стрілками.
        </p>

        {isCreating && (
          <form
            onSubmit={(event) => void handleCreate(event)}
            className="flex flex-col gap-4 border-t border-white/50 pt-4"
          >
            <ImageField
              accessToken={accessToken}
              id="banner-new-image"
              value={draftImage}
              onChange={setDraftImage}
            />
            <LinkField id="banner-new-link" value={draftLink} onChange={setDraftLink} />
            <button
              type="submit"
              disabled={isSaving || draftImage.trim() === ''}
              className={`${PRIMARY_BUTTON_CLASS} self-start`}
            >
              {isSaving ? 'Зачекайте...' : 'Створити'}
            </button>
            {createError && <Notice kind="error">{createError}</Notice>}
          </form>
        )}
      </section>

      {error && <Notice kind="error">{error}</Notice>}
      {isLoading && <Skeleton />}

      {!isLoading && !error && banners.length === 0 && (
        <div className={`${CARD_CLASS} p-6 text-center text-slate-600`}>Банерів ще немає.</div>
      )}

      <div className="flex flex-col gap-4">
        {banners.map((banner, index) => (
          <BannerCard
            key={banner.id}
            accessToken={accessToken}
            banner={banner}
            isFirst={index === 0}
            isLast={index === banners.length - 1}
            onUpdated={(updated) =>
              setBanners((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
            onRemoved={(id) => setBanners((prev) => prev.filter((item) => item.id !== id))}
            onMove={(id, direction) => void handleMove(id, direction)}
          />
        ))}
      </div>
    </div>
  );
}
