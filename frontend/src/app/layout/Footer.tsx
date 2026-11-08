import { Link } from 'react-router';

// Сведения об обладателе информации (149-ФЗ ст. 10 ч. 2, security.md §5)
const TEAM = 'Артём Лыткин (капитан), Всеволод Омельченко, Владислав Пилипенко';

export function Footer() {
  return (
    <footer className="border-t px-gutter py-5 text-[0.8125rem] leading-relaxed text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-1">
        <p className="font-medium text-foreground/80">
          Концепт для конкурса «Цифровой деканат будущего». Не является официальным сервисом МГИМО. Все данные вымышлены.
        </p>
        <p>
          Прототип подготовила команда участников конкурса: {TEAM}.{' '}
          <Link to="/privacy" className="whitespace-nowrap underline underline-offset-2 hover:text-foreground">
            Политика обработки персональных данных
          </Link>
        </p>
      </div>
    </footer>
  );
}
