import { Link } from 'react-router';

// Сведения об обладателе информации (149-ФЗ ст. 10 ч. 2, security.md §5)
const TEAM = 'капитан команды, Всеволод Омельченко, Владислав Пилипенко';

export function Footer() {
  return (
    <footer className="border-t bg-card/60 px-gutter py-6 text-xs leading-relaxed text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        <p className="font-medium text-foreground/80">
          Концепт для конкурса «Цифровой деканат будущего». Не является официальным сервисом МГИМО. Все данные вымышлены.
        </p>
        <p>Прототип подготовила команда участников конкурса: {TEAM}.</p>
        <p>
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Политика обработки персональных данных
          </Link>
        </p>
      </div>
    </footer>
  );
}
