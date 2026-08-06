import { useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBanners } from '../hooks/useBanners';
import type { Banner } from '../types';

// Одни пропорции на всех экранах: при разных object-cover режет бока на
// телефоне, и админ не видит в панели того, что увидит покупатель.
// Те же в скелетоне, иначе при загрузке прыгает вёрстка.
const RATIO_CLASS = 'aspect-[16/6]';

function BannerImage({ banner, eager }: { banner: Banner; eager: boolean }) {
  const image = (
    <img
      src={banner.imageUrl}
      alt=""
      // Первый слайд это LCP главной, откладывать нельзя.
      loading={eager ? 'eager' : 'lazy'}
      className="h-full w-full object-cover"
    />
  );

  if (!banner.link) return image;

  // https:// это внешний сайт, в новой вкладке. Остальное внутренние пути,
  // через Link, чтобы не перезагружать SPA.
  if (banner.link.startsWith('https://')) {
    return (
      <a href={banner.link} target="_blank" rel="noopener noreferrer" className="block h-full">
        {image}
      </a>
    );
  }

  return (
    <Link to={banner.link} className="block h-full">
      {image}
    </Link>
  );
}

export function BannerCarousel() {
  const { banners, isLoading } = useBanners();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (isLoading) {
    return (
      <div className={`mb-8 w-full animate-pulse rounded-3xl bg-white/40 sm:mb-10 ${RATIO_CLASS}`} />
    );
  }

  if (banners.length === 0) return null;

  function scrollToSlide(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
  }

  // Активный слайд считаем из скролла, а не из стейта: свайп пальцем идёт мимо
  // кнопок, и точки рассинхронятся с тем, что видно.
  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  }

  const hasControls = banners.length > 1;

  return (
    <section className="relative mb-8 sm:mb-10" aria-label="Акції та новини">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        // overscroll-x-contain: свайп по карусели на iOS иначе уходит в
        // системный жест «назад» и уносит со страницы.
        className={`flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl border border-white/60 shadow-lg sm:rounded-3xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${RATIO_CLASS}`}
      >
        {banners.map((banner, index) => (
          <div key={banner.id} className="h-full w-full shrink-0 snap-center">
            <BannerImage banner={banner} eager={index === 0} />
          </div>
        ))}
      </div>

      {hasControls && (
        <>
          <button
            type="button"
            aria-label="Попередній банер"
            onClick={() => scrollToSlide(Math.max(active - 1, 0))}
            className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full border border-white/70 bg-white/70 p-2 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white sm:block"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label="Наступний банер"
            onClick={() => scrollToSlide(Math.min(active + 1, banners.length - 1))}
            className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full border border-white/70 bg-white/70 p-2 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white sm:block"
          >
            <ChevronRight size={20} />
          </button>

          {/* Точки на подложке: на светлом фото белое по белому не видно. */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center rounded-full bg-black/25 px-1 backdrop-blur-sm sm:bottom-3">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`Банер ${index + 1}`}
                aria-current={index === active}
                onClick={() => scrollToSlide(index)}
                // Палец попадает по 32px, а видно только полоску 8px.
                className="flex h-8 w-4 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    index === active ? 'w-4 bg-white' : 'w-1.5 bg-white/70'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
