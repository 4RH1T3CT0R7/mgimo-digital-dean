import type { components } from '@/api/academic';

// Данные — docs/contracts/seed.md (student.mo). Владелец дальнейших правок — T09.
type S = components['schemas'];

// Текущий семестр из services/academic/seed: конец — последний день сессии (03_academic_year.sql).
export const mockTermEnd = '2027-01-24';

export const faculties: S['Faculty'][] = [
  { id: '10000000-0000-4000-8000-000000000001', short_name: 'ФМО', name: 'Факультет международных отношений' },
  { id: '10000000-0000-4000-8000-000000000002', short_name: 'МЭО', name: 'Факультет международных экономических отношений' },
  { id: '10000000-0000-4000-8000-000000000003', short_name: 'МП', name: 'Международно-правовой факультет' },
  { id: '10000000-0000-4000-8000-000000000004', short_name: 'МЖ', name: 'Факультет международной журналистики' },
];

const groupMO: S['GroupRef'] = { id: '20000000-0000-4000-8000-000000000001', name: 'МО-24-03' };
const groupEn: S['GroupRef'] = { id: '20000000-0000-4000-8000-000000000002', name: 'Англ-12' };
const groupFr: S['GroupRef'] = { id: '20000000-0000-4000-8000-000000000003', name: 'Фр-07' };

export const profile: S['Profile'] = {
  id: '30000000-0000-4000-8000-000000000001',
  full_name: 'Лебедева Анна Викторовна',
  short_name: 'Лебедева А. В.',
  faculty: faculties[0],
  program: { code: '41.03.05', name: 'Международные отношения' },
  study_level: 'bachelor',
  course: 2,
  group: groupMO,
  language_groups: [
    { ...groupEn, language: 'Английский язык' },
    { ...groupFr, language: 'Французский язык' },
  ],
  student_card_no: '2401317',
  study_form: 'full_time',
  funding: 'budget',
  enrollment_year: 2025,
  status: 'studying',
};

// Сетка пар — data-model.md Б4
const PAIRS = { 1: ['09:00', '10:20'], 2: ['10:30', '11:50'], 3: ['12:00', '13:20'], 4: ['14:20', '15:40'] } as const;
type Pair = keyof typeof PAIRS;

const d = (n: number, name: string) => ({ id: `51000000-0000-4000-8000-00000000000${n}`, name });
const DISC = {
  tmo: d(1, 'Теория международных отношений'),
  hist: d(2, 'История международных отношений'),
  econ: d(3, 'Мировая экономика'),
  law: d(4, 'Международное публичное право'),
  en: d(5, 'Английский язык'),
  fr: d(6, 'Французский язык'),
};
const t = (n: number, short_name: string) => ({ id: `52000000-0000-4000-8000-00000000000${n}`, short_name });
const TEACH = { orlov: t(1, 'Орлов П. С.'), belova: t(2, 'Белова И. Н.'), kravets: t(3, 'Кравец Д. А.'), mironova: t(4, 'Миронова Е. В.'), tikhonov: t(5, 'Тихонов А. Г.') };

// Настоящие аудитории МГИМО: ссылка в расписании открывает их на карте mgimo.ru/territory (D58)
const ROOM = {
  b1047: { building: 'Корпус Б', number: '1047' },
  b1051: { building: 'Корпус Б', number: '1051' },
  b2009: { building: 'Корпус Б', number: '2009' },
  g2115: { building: 'Корпус Г', number: '2115' },
  n202: { building: 'Новый корпус', number: '202' },
  n220: { building: 'Новый корпус', number: '220' },
  n405: { building: 'Новый корпус', number: '405' },
  b1049: { building: 'Корпус Б', number: '1049' },
  b2010: { building: 'Корпус Б', number: '2010' },
  g2116: { building: 'Корпус Г', number: '2116' },
  g3122: { building: 'Корпус Г', number: '3122' },
} satisfies Record<string, S['Room']>;

let seq = 0;
function lesson(
  date: string,
  pair: Pair,
  discipline: { id: string; name: string },
  kind: S['LessonKind'],
  room: S['Room'],
  teacher: S['TeacherRef'],
  groups: S['GroupRef'][],
  extra: Partial<S['Lesson']> = {},
): S['Lesson'] {
  seq += 1;
  return {
    id: `50000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    date,
    start_time: PAIRS[pair][0],
    end_time: PAIRS[pair][1],
    pair_number: pair,
    discipline,
    kind,
    format: 'offline',
    room,
    teacher,
    groups,
    status: 'scheduled',
    change: null,
    moved_to: null,
    ...extra,
  };
}

// Перенос: история МО 17.11 10:30 → 19.11 12:00 (одно занятие — две записи)
const moved = lesson('2026-11-19', 3, DISC.hist, 'seminar', ROOM.b2009, TEACH.belova, [groupMO], {
  status: 'moved',
  change: {
    type: 'moved',
    previous: { date: '2026-11-17', start_time: '10:30', end_time: '11:50', room: ROOM.b2009 },
    reason: 'Преподаватель перенёс занятие',
    changed_at: '2026-11-13T15:20:00+03:00',
  },
});

/** Неделя 16–22.11.2026: перенос, отмена и смена аудитории (seed.md). */
export const weekSchedule: S['Schedule'] = {
  as_of: '2026-11-13T15:20:00+03:00',
  from: '2026-11-16',
  to: '2026-11-22',
  weeks: [{ start_date: '2026-11-16', number: 12, parity: 'even' }],
  lessons: [
    lesson('2026-11-16', 1, DISC.tmo, 'lecture', ROOM.b1047, TEACH.orlov, [groupMO]),
    lesson('2026-11-16', 2, DISC.en, 'language', ROOM.n202, TEACH.mironova, [groupEn]),
    lesson('2026-11-16', 3, DISC.econ, 'seminar', ROOM.g2115, TEACH.kravets, [groupMO]),
    lesson('2026-11-17', 1, DISC.law, 'lecture', ROOM.b1051, TEACH.tikhonov, [groupMO]),
    { ...moved, date: '2026-11-17', start_time: '10:30', end_time: '11:50', pair_number: 2, status: 'moved_away', moved_to: { date: '2026-11-19', start_time: '12:00' } },
    lesson('2026-11-17', 3, DISC.fr, 'language', ROOM.n220, TEACH.belova, [groupFr]),
    lesson('2026-11-18', 2, DISC.tmo, 'seminar', ROOM.b2009, TEACH.orlov, [groupMO]),
    lesson('2026-11-18', 3, DISC.econ, 'lecture', ROOM.b1047, TEACH.kravets, [groupMO], {
      status: 'cancelled',
      change: {
        type: 'cancelled',
        previous: { date: '2026-11-18', start_time: '12:00', end_time: '13:20', room: ROOM.b1047 },
        reason: 'Преподаватель заболел',
        changed_at: '2026-11-13T09:00:00+03:00',
      },
    }),
    lesson('2026-11-18', 4, DISC.en, 'language', ROOM.n202, TEACH.mironova, [groupEn]),
    lesson('2026-11-19', 1, DISC.hist, 'lecture', ROOM.b1051, TEACH.belova, [groupMO]),
    moved,
    lesson('2026-11-20', 2, DISC.law, 'seminar', ROOM.n405, TEACH.tikhonov, [groupMO], {
      status: 'changed',
      change: {
        type: 'room_changed',
        previous: { date: '2026-11-20', start_time: '10:30', end_time: '11:50', room: ROOM.b2009 },
        reason: null,
        changed_at: '2026-11-12T11:00:00+03:00',
      },
    }),
    lesson('2026-11-20', 3, DISC.fr, 'language', ROOM.n220, TEACH.belova, [groupFr]),
  ],
};

/** Сессия, как в services/academic/seed/03_academic_year.sql; даты — как у дедлайнов в notifications. */
export const sessionLessons: S['Lesson'][] = [
    lesson('2026-12-18', 2, DISC.law, 'credit', ROOM.g3122, TEACH.tikhonov, [groupMO]),
    lesson('2026-12-22', 3, DISC.en, 'credit', ROOM.n202, TEACH.mironova, [groupEn]),
    lesson('2026-12-24', 3, DISC.fr, 'credit', ROOM.n220, TEACH.belova, [groupFr]),
    lesson('2027-01-11', 3, DISC.tmo, 'consultation', ROOM.b1049, TEACH.orlov, [groupMO]),
    lesson('2027-01-12', 1, DISC.tmo, 'exam', ROOM.b1047, TEACH.orlov, [groupMO], { end_time: '13:20' }),
    lesson('2027-01-14', 3, DISC.hist, 'consultation', ROOM.b2010, TEACH.belova, [groupMO]),
    lesson('2027-01-15', 1, DISC.hist, 'exam', ROOM.b2009, TEACH.belova, [groupMO], { end_time: '13:20' }),
    lesson('2027-01-18', 3, DISC.econ, 'consultation', ROOM.g2116, TEACH.kravets, [groupMO]),
    lesson('2027-01-19', 1, DISC.econ, 'exam', ROOM.g2115, TEACH.kravets, [groupMO], { end_time: '13:20' }),
];

const scores = [55, 50, 48, 40, 55, 30];
const attendance = [95, 90, 85, 90, 65, 90];

export const currentGrades: S['CurrentGrades'] = {
    as_of: '2026-11-18T09:00:00+03:00',
    semester: 3,
    disciplines: Object.values(DISC).map((discipline, index): S['CurrentDiscipline'] => {
        const score = scores[index];
        const traffic = index === 5 ? 'red' : index === 3 || index === 4 ? 'yellow' : 'green';

        return {
            discipline,
            // Как в seed: зачёты — по дисциплинам с зачётом в сессии (МПП, языки)
            control_form: index >= 3 ? 'credit' : 'exam',
            teacher: Object.values(TEACH)[index % 5],
            score,
            max_to_date: 60,
            attendance_percent: attendance[index],
            traffic,
            traffic_reason: index === 5 ? 'Набрано меньше 60% возможных баллов' : index === 3 ? 'Набрано меньше 75% возможных баллов' : index === 4 ? 'Посещаемость ниже 70%' : null,
            to_excellent: { needed: 90 - score, achievable: 90 - score <= 40 },
            control_points: [
                { date: '2026-10-01', title: 'Контрольная работа 1', score: Math.floor(score / 2), max: 30 },
                { date: '2026-10-22', title: 'Семинарская работа', score: score - Math.floor(score / 2), max: 30 },
                { date: '2026-11-12', title: 'Контрольная работа 2', score: null, max: 30 },
            ],
        };
    }).sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.traffic] - { red: 0, yellow: 1, green: 2 }[b.traffic])),
};

export const sessionResults: S['SessionResults'] = {
    as_of: currentGrades.as_of,
    semesters: [2, 1].map((semester): S['SessionResults']['semesters'][number] => ({
        semester,
        academic_year: '2025/2026',
        term: semester === 2 ? 'spring' : 'autumn',
        results: Object.values(DISC).map((discipline, index): S['SessionResult'] => ({
            discipline,
            control_form: index === 5 ? 'credit' : index === 4 ? 'graded_credit' : 'exam',
            hours: 108,
            credits: 3,
            percent: index === 5 ? null : [95, 85, 78, 70, 63][index],
            grade5: index === 5 ? null : (['excellent', 'good', 'good', 'satisfactory', 'satisfactory'] as const)[index],
            ects: index === 5 ? null : (['A', 'B', 'C', 'D', 'E'] as const)[index],
            passed: index === 5 ? true : null,
            status: 'passed',
            date: semester === 2 ? '2026-06-20' : '2026-01-20',
        })),
    })),
};

export const gradesSummary: S['GradesSummary'] = {
    as_of: currentGrades.as_of,
    current_semester: 3,
    average_grade5: 3.8,
    average_percent: 78.2,
    debts_count: 0,
    rating: { semester: 2, percent: 82.5, percentile: 78 },
    traffic: { green: 3, yellow: 2, red: 1 },
};

/** Календарный план (D62): периоды и события из тех же контрольных точек и занятий сессии. */
export const academicCalendar: S['AcademicCalendar'] = {
    term: { academic_year: '2026/2027', term: 'autumn', start_date: '2026-09-01', end_date: mockTermEnd },
    periods: [
        { kind: 'study', start_date: '2026-09-01', end_date: '2026-12-20' },
        { kind: 'credit_week', start_date: '2026-12-21', end_date: '2026-12-27' },
        { kind: 'holidays', start_date: '2026-12-28', end_date: '2027-01-10' },
        { kind: 'session', start_date: '2027-01-11', end_date: '2027-01-24' },
        { kind: 'vacation', start_date: '2027-01-25', end_date: '2027-02-07' },
    ],
    events: [
        ...currentGrades.disciplines.flatMap(({ discipline, control_points }, i) => control_points.map((point, j): S['AcademicEvent'] => ({
            id: `72000000-0000-4000-8000-${String(i * 3 + j + 1).padStart(12, '0')}`,
            kind: 'control_point', date: point.date, start_time: null, end_time: null, title: point.title, discipline, room: null,
        }))),
        ...sessionLessons.map((item): S['AcademicEvent'] => ({
            id: item.id, kind: item.kind as S['AcademicEventKind'], date: item.date, start_time: item.start_time, end_time: item.end_time,
            title: null, discipline: item.discipline, room: item.room,
        })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? '')),
};

export const staffGroups: S['GroupInfo'][] = [
    { ...groupMO, kind: 'academic', course: 2, faculty_short: 'ФМО' },
    { ...groupEn, kind: 'language', course: 2, faculty_short: 'ФМО' },
    { ...groupFr, kind: 'language', course: 2, faculty_short: 'ФМО' },
    { id: '20000000-0000-4000-8000-000000000004', name: 'МЭО-23-02', kind: 'academic', course: 3, faculty_short: 'МЭО' },
];

export const academicState = { lessons: structuredClone([...weekSchedule.lessons, ...sessionLessons]), asOf: weekSchedule.as_of };

export function resetAcademicState()
{
    academicState.lessons = structuredClone([...weekSchedule.lessons, ...sessionLessons]);
    academicState.asOf = weekSchedule.as_of;
}
