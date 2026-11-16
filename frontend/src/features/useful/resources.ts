import type { components } from '@/api/academic';

type Room = components['schemas']['Room'];

/**
 * Официальные ресурсы МГИМО (D63, план функциональности 16.11; ссылки проверены 16.11.2026).
 * Меняются раз в год — правятся здесь через PR, редактора нет.
 */
export const resourceGroups: { title: string; links: { title: string; url: string }[] }[] = [
  {
    title: 'Учёба',
    links: [
      { title: 'Расписание на сайте МГИМО', url: 'https://mgimo.ru/study/schedule/' },
      { title: 'Учебные планы и графики', url: 'https://mgimo.ru/sveden/education/' },
      { title: 'Библиотека', url: 'https://mgimo.ru/library/' },
      { title: 'Прежний личный кабинет студента', url: 'https://lks.mgimo.ru/' },
    ],
  },
  {
    title: 'Стипендии и жильё',
    links: [
      { title: 'Стипендии и социальная поддержка', url: 'https://mgimo.ru/study/grants/' },
      { title: 'Общежития', url: 'https://mgimo.ru/territory/infrastructure/dorms/' },
    ],
  },
  {
    title: 'Кампус и студенческая жизнь',
    links: [
      { title: 'Карта кампуса', url: 'https://mgimo.ru/territory/' },
      { title: 'Студенческие организации', url: 'https://mgimo.ru/about/structure/student-org/' },
      { title: 'Стажировки и трудоустройство', url: 'https://mgimo.ru/students/career/' },
      { title: 'Первокурсникам', url: 'https://mgimo.ru/about/structure/uvr/docs/freshmen/' },
      { title: 'Telegram-канал МГИМО', url: 'https://t.me/mgimo_university' },
    ],
  },
  {
    title: 'Вопросы и обращения',
    links: [
      { title: 'Частые вопросы', url: 'https://mgimo.ru/faq/' },
      { title: 'Задать вопрос университету', url: 'https://mgimo.ru/appeal/' },
      { title: 'Омбудсмен', url: 'https://mgimo.ru/about/structure/units/ombudsman/' },
      { title: '«Барометр студенческого мнения»', url: 'https://mgimo.ru/polls/' },
    ],
  },
];

export const campusMapUrl = 'https://mgimo.ru/territory/';

/** Часы приёма деканатов — вымышлены (учебный прототип). */
export const deanHours: [days: string, time: string][] = [
  ['Понедельник — четверг', '10:00–17:00'],
  ['Пятница', '10:00–16:00'],
  ['Перерыв', '13:00–14:00'],
];
/** То же фразой — для страницы входа */
export const deanHoursText = 'с понедельника по четверг с 10:00 до 17:00, в пятницу — до 16:00, перерыв с 13:00 до 14:00';

/** Деканаты по факультету из профиля. Кабинет — настоящая учебная аудитория (D58), почта вымышлена. */
export const deanOffices: Record<string, { room: Room; email: string }> = {
  ФМО: { room: { building: 'Корпус Б', number: '1051' }, email: 'dekanat.fmo@moy-vuz.example' },
  МЭО: { room: { building: 'Корпус Г', number: '2115' }, email: 'dekanat.meo@moy-vuz.example' },
};
