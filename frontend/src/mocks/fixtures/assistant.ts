import type { components } from '@/api/assistant';

// Ответы помощника по записям content/faq.md. Первая подходящая запись — по словам из вопроса.
// llm — пересказ записей «моделью», faq — текст записи как есть (так отвечает services/assistant без ключа LLM).
type Answer = components['schemas']['Answer'];

export const MAX_QUESTIONS_PER_HOUR = 20;

export const answers: { words: string[]; answer: Answer }[] = [
  {
    words: ['военкомат', 'военный комиссариат'],
    answer: {
      provider: 'llm',
      answer:
        'Подайте заявку «Справка в военкомат». В форме впишите название военного комиссариата и выберите, как получить справку: забрать в деканате или электронной копией. Готовность проверяйте в карточке заявки в разделе «Заявки».',
      sources: [
        { faq_id: 'military-certificate-order', title: 'Что указать в заявке на справку в военкомат?' },
        { faq_id: 'military-certificate-result', title: 'Как узнать, готова ли справка в военкомат?' },
      ],
      suggested_action: { service_type_id: 'military-certificate', prefill: { delivery: 'Электронная копия' } },
    },
  },
  {
    words: ['академ'],
    answer: {
      provider: 'llm',
      answer:
        'Подайте заявление «Академический отпуск» и укажите дату, с которой хотите прервать учёбу. Подтверждающий документ можно приложить сразу или позже. Основания и список документов для вашей ситуации уточните в деканате; пока заявление рассматривают, спросите в переписке, как быть с занятиями.',
      sources: [
        { faq_id: 'academic-leave-apply', title: 'Как подать заявление на академический отпуск?' },
        { faq_id: 'academic-leave-start', title: 'Можно ли перестать ходить на занятия сразу после подачи заявления на академический отпуск?' },
      ],
      suggested_action: { service_type_id: 'academic-leave', prefill: {} },
    },
  },
  {
    words: ['студенческ'],
    answer: {
      provider: 'faq',
      answer:
        'Откройте услугу «Повторная выдача студенческого билета» и выберите причину «Утерян». В карточке заявки проверяйте статус и сообщения. Как получить новый билет, уточните у деканата.',
      sources: [
        { faq_id: 'student-card-lost', title: 'Что делать, если я потерял студенческий билет?' },
        { faq_id: 'student-card-replace', title: 'Можно ли заменить студенческий билет после смены фамилии или из-за повреждения?' },
      ],
      suggested_action: { service_type_id: 'student-card-reissue', prefill: { reason: 'Утерян' } },
    },
  },
  {
    words: ['расписан', 'пары', 'неделю'],
    answer: {
      provider: 'faq',
      answer:
        'Откройте «Расписание» и переключите неделю стрелками. В списке по дням видны академические занятия и пары ваших языковых групп.',
      sources: [
        { faq_id: 'schedule-week', title: 'Где посмотреть пары на другую неделю?' },
        { faq_id: 'schedule-calendar', title: 'Как добавить расписание в календарь на телефоне?' },
      ],
      suggested_action: null,
    },
  },
];

/** Ничего не нашлось — как notFoundAnswer в services/assistant: вопрос переносится в заявку «Вопрос в деканат». */
export function notFound(question: string): Answer {
  return {
    provider: 'faq',
    answer: 'В справочнике нет ответа на этот вопрос. Задайте его деканату — ответ придёт в заявке «Вопрос в деканат».',
    sources: [],
    suggested_action: { service_type_id: 'dean-question', prefill: { question } },
  };
}
