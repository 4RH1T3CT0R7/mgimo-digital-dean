import { Outlet, useLocation } from 'react-router';
import { Footer } from './Footer';
import { Logo } from './Logo';

/** Страницы без входа: /login, /privacy, /verify, 404. */
export function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-header shrink-0 items-center border-b bg-card/60 px-gutter">
        <div className="mx-auto w-full max-w-6xl">
          <Logo />
        </div>
      </header>
      <main id="main" className="relative isolate mx-auto w-full max-w-6xl flex-1 px-gutter py-5 md:py-8">
        {/* Большой силуэт — на коротких экранах; под длинным текстом политики он мешает читать */}
        {pathname !== '/privacy' && <div aria-hidden className="skyline skyline-hero" />}
        <div key={pathname} className="animate-[rise_200ms_ease-out]">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
