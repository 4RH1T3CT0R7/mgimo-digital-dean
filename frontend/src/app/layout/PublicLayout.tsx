import { Outlet } from 'react-router';
import { Footer } from './Footer';
import { Logo } from './Logo';

/** Страницы без входа: /login, /privacy, /verify, 404. */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-header shrink-0 items-center border-b bg-card/60 px-gutter">
        <div className="mx-auto w-full max-w-6xl">
          <Logo />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-gutter py-5 md:py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
