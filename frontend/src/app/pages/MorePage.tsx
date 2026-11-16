import { ChevronRightIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/shared/ui/page-header';
import { useMe } from '@/features/auth/queries';
import { staffNav, studentNav } from '../layout/nav';

/** «Ещё» (D63): разделы, которым не хватило нижней вкладки. Список — из того же конфига, что и меню. */
export function MorePage({ staff = false }: { staff?: boolean }) {
  const admin = useMe().data?.role === 'admin';
  const items = staff ? staffNav(admin) : studentNav;
  return (
    <div className="max-w-xl">
      <PageHeader title="Ещё" />
      <nav aria-label="Другие разделы">
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items
            .filter((item) => item.place === 'more')
            .map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 font-medium transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset md:px-5"
                >
                  <item.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}
