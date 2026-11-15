import type { components } from '@/api/notifications';

type S = components['schemas'];
export type AnnouncementType = S['CreateAnnouncementRequest']['type'];

export const announcementTypeLabels: Record<AnnouncementType, string> = {
  announcement: 'Объявление',
  news: 'Новость',
};

export const deadlineKindLabels: Record<S['DeadlineKind'], string> = {
  application: 'Подача заявлений',
  exam: 'Экзамен',
  credit: 'Зачёт',
  coursework: 'Курсовая',
  other: 'Другое',
};

export const audienceKindLabels: Record<S['Audience']['kind'], string> = {
  faculty: 'Весь факультет',
  course: 'Курс',
  group: 'Группа',
  all: 'Все студенты',
  user: 'Один студент',
};
