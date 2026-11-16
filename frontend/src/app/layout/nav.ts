import {
  BellIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  FileTextIcon,
  GraduationCapIcon,
  HouseIcon,
  IdCardIcon,
  MessageCircleQuestionIcon,
  NewspaperIcon,
  ShieldCheckIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Когда пункт активен; по умолчанию — адрес совпадает или вложен */
  match?: (pathname: string) => boolean;
  /** Счётчик на значке (непрочитанные) */
  badge?: number;
  /**
   * Где пункт на телефоне; на ПК все пункты — в боковом меню (D63).
   * tab — нижняя вкладка (по умолчанию), more — страница «Ещё», desktop — только на ПК (на телефоне свой вход, как колокольчик).
   */
  place?: 'tab' | 'more' | 'desktop';
};

/** Разделы студента (D63). Новый раздел — одна строка; с `place: 'more'` он попадёт и на страницу «Ещё». */
export const studentNav: NavItem[] = [
  { to: '/', label: 'Сегодня', icon: HouseIcon },
  { to: '/schedule', label: 'Расписание', icon: CalendarDaysIcon },
  { to: '/grades', label: 'Учёба', icon: GraduationCapIcon },
  { to: '/requests', label: 'Заявки', icon: FileTextIcon },
  { to: '/notifications', label: 'Уведомления', icon: BellIcon, place: 'desktop' },
  { to: '/news', label: 'Новости', icon: NewspaperIcon, place: 'more' },
  { to: '/student-card', label: 'Студенческий', icon: IdCardIcon, place: 'more' },
  { to: '/useful', label: 'Полезное', icon: BookmarkIcon, place: 'more' },
  { to: '/assistant', label: 'Помощник', icon: MessageCircleQuestionIcon, place: 'more' },
  { to: '/profile', label: 'Профиль', icon: UserIcon, place: 'more' },
  { to: '/security', label: 'Безопасность', icon: ShieldCheckIcon, place: 'more' },
];

export function isActive(item: NavItem, pathname: string) {
  return item.match ? item.match(pathname) : pathname === item.to || pathname.startsWith(`${item.to}/`);
}
