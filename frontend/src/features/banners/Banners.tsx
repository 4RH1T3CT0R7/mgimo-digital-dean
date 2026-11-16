import { TriangleAlertIcon, XIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { components } from '@/api/notifications';
import { apiErrorMessage } from '@/shared/lib/errors';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { useDismissBanner, useMyBanners } from './queries';

type Banner = components['schemas']['Banner'];

const linkClass = 'inline-flex min-h-11 w-fit items-center font-medium text-primary underline underline-offset-4';

/** Ссылка баннера: раздел кабинета или https в новой вкладке. Остальное не показываем (сервер такое и не пропустит). */
function BannerLink({ banner }: { banner: Banner }) {
  const { link_url: url, link_label: label } = banner;
  if (!url || !label) return null;
  if (/^\/[a-z0-9][a-z0-9/_-]*$/.test(url)) {
    return (
      <Link to={url} className={linkClass}>
        {label}
      </Link>
    );
  }
  if (!url.startsWith('https://')) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {label}
      <span className="sr-only"> (откроется в новой вкладке)</span>
    </a>
  );
}

/** Обычные баннеры — карточки вверху «Сегодня», каждую можно скрыть. */
export function TodayBanners() {
  const banners = useMyBanners().data?.filter((item) => item.priority === 'normal') ?? [];
  const dismiss = useDismissBanner();
  if (banners.length === 0) return null;
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-3">
      {banners.map((item) => (
        <section
          key={item.id}
          aria-labelledby={`banner-${item.id}`}
          className="flex min-w-0 items-start gap-2 rounded-xl border bg-card py-3 pr-2 pl-4 md:pl-5"
        >
          <div className="min-w-0 flex-1 pt-1.5 wrap-anywhere">
            <h2 id={`banner-${item.id}`} className="font-semibold">
              {item.title}
            </h2>
            {item.body && <p className="mt-1 max-w-prose text-muted-foreground">{item.body}</p>}
            <BannerLink banner={item} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Скрыть «${item.title}»`}
            title="Скрыть"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate(item.id, { onError: (error) => toast.error(apiErrorMessage(error)) })}
          >
            <XIcon className="size-5" aria-hidden />
          </Button>
        </section>
      ))}
    </div>
  );
}

/** Срочные баннеры — полоса под шапкой на всех страницах студента, закрыть нельзя. */
export function UrgentBanners() {
  const banners = useMyBanners().data?.filter((item) => item.priority === 'urgent') ?? [];
  if (banners.length === 0) return null;
  return (
    <div role="status" className="mb-6 flex flex-col gap-3">
      {banners.map((item) => (
        <div key={item.id} className="flex min-w-0 gap-3 rounded-xl border border-warning-strong/25 bg-warning-soft p-4 wrap-anywhere">
          <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warning-strong" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-warning-strong">
              <span className="sr-only">Важное объявление: </span>
              {item.title}
            </p>
            {item.body && <p className="mt-0.5 max-w-prose text-sm">{item.body}</p>}
            <BannerLink banner={item} />
          </div>
        </div>
      ))}
    </div>
  );
}
