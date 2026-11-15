import type { components } from '@/api/notifications';
import type { Me } from '@/app/session';
import { useStaffGroups } from '@/features/staff-lessons/queries';
import { fieldClass } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { QueryView } from '@/shared/ui/query-view';
import { EmptyState } from '@/shared/ui/empty-state';
import { useFaculties } from './queries';
import { fieldState } from './fields';

type Audience = components['schemas']['Audience'];

export function FieldError({ name, message }: { name: string; message?: string }) {
  return message ? <p id={`${name}-error`} role="alert" className="text-sm text-danger-strong">{message}</p> : null;
}

export function AudienceField({ me, value, onChange, errors }: {
  me: Me;
  value: Audience;
  onChange: (next: Audience) => void;
  errors: Record<string, string>;
}) {
  const admin = me.role === 'admin';
  const faculties = useFaculties(admin && value.kind !== 'all');
  const groups = useStaffGroups(admin ? value.faculty_id : undefined, value.kind === 'group' && (!admin || !!value.faculty_id));
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-lg border p-3">
      <legend className="px-1 font-medium">Адресат</legend>
      <div className="grid gap-2">
        <Label htmlFor="audience-kind">Кому показать</Label>
        <select id="audience-kind" className={`${fieldClass} h-11`} value={value.kind}
          {...fieldState('audience', errors.audience ?? errors['audience.kind'])}
          onChange={(event) => {
            const kind = event.target.value as Audience['kind'];
            onChange({ kind, ...(kind !== 'all' && { faculty_id: value.faculty_id }), ...(kind === 'course' && { course: 1 }) });
          }}>
          <option value="faculty">Весь факультет</option>
          <option value="course">Курс</option>
          <option value="group">Группа</option>
          {admin && <option value="all">Все студенты</option>}
        </select>
        <FieldError name="audience" message={errors.audience ?? errors['audience.kind']} />
      </div>
      {admin && value.kind !== 'all' && (
        <QueryView query={faculties} isEmpty={(items) => items.length === 0} empty={<EmptyState title="Нет доступных факультетов" />}>
          {(items) => (
            <div className="grid gap-2">
              <Label htmlFor="audience-faculty">Факультет</Label>
              <select id="audience-faculty" className={`${fieldClass} h-11`} value={value.faculty_id ?? ''}
                {...fieldState('faculty_id', errors['audience.faculty_id'] ?? errors.faculty_id)}
                onChange={(event) => onChange({ ...value, faculty_id: event.target.value || undefined, group_id: undefined })}>
                <option value="">Выберите факультет</option>
                {items.map((faculty) => <option value={faculty.id} key={faculty.id}>{faculty.short_name} — {faculty.name}</option>)}
              </select>
              <FieldError name="faculty_id" message={errors['audience.faculty_id'] ?? errors.faculty_id} />
            </div>
          )}
        </QueryView>
      )}
      {value.kind === 'course' && (
        <div className="grid gap-2">
          <Label htmlFor="audience-course">Курс</Label>
          <select id="audience-course" className={`${fieldClass} h-11`} value={value.course ?? 1}
            {...fieldState('course', errors['audience.course'] ?? errors.course)}
            onChange={(event) => onChange({ ...value, course: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((course) => <option key={course} value={course}>{course} курс</option>)}
          </select>
          <FieldError name="course" message={errors['audience.course'] ?? errors.course} />
        </div>
      )}
      {value.kind === 'group' && (!admin || value.faculty_id) && (
        <QueryView query={groups} isEmpty={(items) => items.length === 0} empty={<EmptyState title="Нет доступных групп" />}>
          {(items) => (
            <div className="grid gap-2">
              <Label htmlFor="audience-group">Группа</Label>
              <select id="audience-group" className={`${fieldClass} h-11`} value={value.group_id ?? ''}
                {...fieldState('group_id', errors['audience.group_id'] ?? errors.group_id)}
                onChange={(event) => onChange({ ...value, group_id: event.target.value || undefined })}>
                <option value="">Выберите группу</option>
                {items.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
              </select>
              <FieldError name="group_id" message={errors['audience.group_id'] ?? errors.group_id} />
            </div>
          )}
        </QueryView>
      )}
    </fieldset>
  );
}

export function AudienceLabel({ audience, admin }: { audience: Audience; admin: boolean }) {
  const faculties = useFaculties(admin && !!audience.faculty_id);
  const groups = useStaffGroups(admin ? audience.faculty_id : undefined, audience.kind === 'group');
  const faculty = admin ? faculties.data?.find(({ id }) => id === audience.faculty_id)?.short_name : null;
  switch (audience.kind) {
    case 'all': return 'Все студенты';
    case 'faculty': return faculty ? `Весь факультет · ${faculty}` : 'Весь факультет';
    case 'course': return `${audience.course} курс${faculty ? ` · ${faculty}` : ''}`;
    case 'group': {
      const group = groups.data?.find(({ id }) => id === audience.group_id);
      return group ? `Группа ${group.name}` : 'Учебная группа';
    }
    case 'user': return 'Один студент';
  }
}
