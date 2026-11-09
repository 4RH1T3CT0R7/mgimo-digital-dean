import type { components } from '@/api/academic';

// Данные — docs/contracts/seed.md (student.mo). Владелец дальнейших правок — T09.
type S = components['schemas'];

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

let seq = 0;
function lesson(
  date: string,
  pair: Pair,
  discipline: { id: string; name: string },
  kind: S['LessonKind'],
  room: string,
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
    room: { building: 'Главный корпус', number: room },
    teacher,
    groups,
    status: 'scheduled',
    change: null,
    moved_to: null,
    ...extra,
  };
}

// Перенос: история МО 17.11 10:30 → 19.11 12:00 (одно занятие — две записи)
const moved = lesson('2026-11-19', 3, DISC.hist, 'seminar', '2105', TEACH.belova, [groupMO], {
  status: 'moved',
  change: {
    type: 'moved',
    previous: { date: '2026-11-17', start_time: '10:30', end_time: '11:50', room: { building: 'Главный корпус', number: '2105' } },
    reason: 'Перенос по просьбе преподавателя',
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
    lesson('2026-11-16', 1, DISC.tmo, 'lecture', '1001', TEACH.orlov, [groupMO]),
    lesson('2026-11-16', 2, DISC.en, 'language', '3112', TEACH.mironova, [groupEn]),
    lesson('2026-11-16', 3, DISC.econ, 'seminar', '2210', TEACH.kravets, [groupMO]),
    lesson('2026-11-17', 1, DISC.law, 'lecture', '1003', TEACH.tikhonov, [groupMO]),
    { ...moved, date: '2026-11-17', start_time: '10:30', end_time: '11:50', pair_number: 2, status: 'moved_away', moved_to: { date: '2026-11-19', start_time: '12:00' } },
    lesson('2026-11-17', 3, DISC.fr, 'language', '3204', TEACH.belova, [groupFr]),
    lesson('2026-11-18', 2, DISC.tmo, 'seminar', '2105', TEACH.orlov, [groupMO]),
    lesson('2026-11-18', 3, DISC.econ, 'lecture', '1001', TEACH.kravets, [groupMO], {
      status: 'cancelled',
      change: {
        type: 'cancelled',
        previous: { date: '2026-11-18', start_time: '12:00', end_time: '13:20', room: { building: 'Главный корпус', number: '1001' } },
        reason: 'Болезнь преподавателя',
        changed_at: '2026-11-13T09:00:00+03:00',
      },
    }),
    lesson('2026-11-18', 4, DISC.en, 'language', '3112', TEACH.mironova, [groupEn]),
    lesson('2026-11-19', 1, DISC.hist, 'lecture', '1003', TEACH.belova, [groupMO]),
    moved,
    lesson('2026-11-20', 2, DISC.law, 'seminar', '3047', TEACH.tikhonov, [groupMO], {
      status: 'changed',
      change: {
        type: 'room_changed',
        previous: { date: '2026-11-20', start_time: '10:30', end_time: '11:50', room: { building: 'Главный корпус', number: '2105' } },
        reason: null,
        changed_at: '2026-11-12T11:00:00+03:00',
      },
    }),
    lesson('2026-11-20', 3, DISC.fr, 'language', '3204', TEACH.belova, [groupFr]),
  ],
};

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
            control_form: index === 5 ? 'credit' : 'exam',
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

export const staffGroups: S['GroupInfo'][] = [
    { ...groupMO, kind: 'academic', course: 2, faculty_short: 'ФМО' },
    { ...groupEn, kind: 'language', course: 2, faculty_short: 'ФМО' },
    { ...groupFr, kind: 'language', course: 2, faculty_short: 'ФМО' },
    { id: '20000000-0000-4000-8000-000000000004', name: 'МЭО-23-02', kind: 'academic', course: 3, faculty_short: 'МЭО' },
];

export const academicState = { lessons: structuredClone(weekSchedule.lessons), asOf: weekSchedule.as_of };

export function resetAcademicState()
{
    academicState.lessons = structuredClone(weekSchedule.lessons);
    academicState.asOf = weekSchedule.as_of;
}
