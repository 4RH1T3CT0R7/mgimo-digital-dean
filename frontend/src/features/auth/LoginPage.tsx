import { ExternalLinkIcon, LoaderCircleIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, type Location } from 'react-router';
import { homePath } from '@/app/session';
import { campusMapUrl, deanHoursText } from '@/features/useful/resources';
import { apiErrorMessage } from '@/shared/lib/errors';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useLogin, useMe } from './queries';

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const from = (useLocation().state as { from?: Location } | null)?.from;

  // Вошли (или уже были в системе) — туда, откуда пришли, или на главную своей роли
  if (me.data) return <Navigate to={from ? from.pathname + from.search : homePath(me.data.role)} replace />;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({ login: String(form.get('login')).trim(), password: String(form.get('password')) });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-6 md:py-16">
      {/* Крупный логотип над формой, как на страницах входа вузов (замечание команды 22.11) */}
      <div className="flex flex-col items-center text-center">
        <img src="/brand/logo-160.png" srcSet="/brand/logo-160.png 1x, /brand/logo-320.png 2x" width={112} height={112} alt="" className="mb-5 size-28" />
        <h1 className="text-[1.75rem] leading-tight font-bold">Вход в личный кабинет</h1>
        <p className="mt-1.5 text-muted-foreground">Для студентов и сотрудников деканата</p>
      </div>
      <Card>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={onSubmit} aria-describedby={login.isError ? 'login-error' : undefined}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login">Логин</Label>
              <Input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
            </div>
            {login.isError && (
              <p id="login-error" role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                {apiErrorMessage(login.error)}
              </p>
            )}
            <Button type="submit" size="lg" disabled={login.isPending}>
              {login.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
              {login.isPending ? 'Входим…' : 'Войти'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <section aria-labelledby="dean-where" className="flex flex-col gap-1.5 text-sm">
        <h2 id="dean-where" className="font-semibold">
          Где найти деканат
        </h2>
        <p className="text-muted-foreground">
          Деканаты принимают {deanHoursText}. Кабинет своего деканата вы увидите после входа, в разделе «Полезное». Часы в прототипе вымышлены.
        </p>
        <a href={campusMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 self-start text-primary underline underline-offset-4">
          Карта кампуса на mgimo.ru
          <ExternalLinkIcon className="size-4" aria-hidden />
          <span className="sr-only"> (в новой вкладке)</span>
        </a>
      </section>
      <p className="text-sm text-muted-foreground">
        Это демонстрационный прототип. Логины и пароли тестовых пользователей — в описании конкурсной работы.
      </p>
    </div>
  );
}
