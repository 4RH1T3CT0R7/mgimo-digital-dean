import type { components } from '@/api/notifications';
import type { Me } from '@/app/session';
import { useStaffGroups } from '@/features/staff-lessons/queries';
import { EmptyState } from '@/shared/ui/empty-state';
import { Label } from '@/shared/ui/label';
import { QueryView } from '@/shared/ui/query-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { fieldState } from './fields';
import { audienceKindLabels } from './labels';
import { useFaculties } from './queries';

type Audience = components['schemas']['Audience'];

export function FieldError({ name, message }: { name: string; message?: string }) {
  return message ? (
    <p id={`${name}-error`} role="alert" className="text-sm text-danger-strong">
      {message}
    </p>
  ) : null;
}

/** Поле выбора на общем Select. Пустое `value` показывает `placeholder`. */
export function SelectField({ id, label, name, value, onChange, options, placeholder, error }: {
  id: string;
  label: string;
  /** Имя поля для связи с текстом ошибки */
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} {...fieldState(name, error)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError name={name} message={error} />
    </div>
  );
}

export function AudienceField({ me, value, onChange, errors }: {
  me: Me;
  value: Audience;
  onChange: (next: Audience) => void;
  errors: Record<string, string>;
}) {
  const admin = me.role === 'admin';
  const kinds: Audience['kind'][] = admin ? ['faculty', 'course', 'group', 'all'] : ['faculty', 'course', 'group'];
  const faculties = useFaculties(admin && value.kind !== 'all');
  const groups = useStaffGroups(
    admin ? value.faculty_id : undefined,
    value.kind === 'group' && (!admin || !!value.faculty_id),
  );

  function changeKind(next: string) {
    const kind = next as Audience['kind'];
    onChange({
      kind,
      ...(kind !== 'all' && { faculty_id: value.faculty_id }),
      ...(kind === 'course' && { course: 1 }),
    });
  }

  return (
    <fieldset className="grid min-w-0 gap-4">
      <legend className="pb-2 font-semibold">Адресат</legend>
      <SelectField
        id="audience-kind"
        label="Кому показать"
        name="audience"
        value={value.kind}
        onChange={changeKind}
        options={kinds.map((kind) => ({ value: kind, label: audienceKindLabels[kind] }))}
        error={errors.audience ?? errors['audience.kind']}
      />
      {admin && value.kind !== 'all' && (
        <QueryView query={faculties} isEmpty={(items) => items.length === 0} empty={<EmptyState title="Нет доступных факультетов" />}>
          {(items) => (
            <SelectField
              id="audience-faculty"
              label="Факультет"
              name="faculty_id"
              value={value.faculty_id ?? ''}
              onChange={(faculty_id) => onChange({ ...value, faculty_id, group_id: undefined })}
              options={items.map((faculty) => ({ value: faculty.id, label: `${faculty.short_name} — ${faculty.name}` }))}
              placeholder="Выберите факультет"
              error={errors['audience.faculty_id'] ?? errors.faculty_id}
            />
          )}
        </QueryView>
      )}
      {value.kind === 'course' && (
        <SelectField
          id="audience-course"
          label="Курс"
          name="course"
          value={String(value.course ?? 1)}
          onChange={(course) => onChange({ ...value, course: Number(course) })}
          options={[1, 2, 3, 4, 5, 6].map((course) => ({ value: String(course), label: `${course} курс` }))}
          error={errors['audience.course'] ?? errors.course}
        />
      )}
      {value.kind === 'group' && (!admin || value.faculty_id) && (
        <QueryView query={groups} isEmpty={(items) => items.length === 0} empty={<EmptyState title="Нет доступных групп" />}>
          {(items) => (
            <SelectField
              id="audience-group"
              label="Группа"
              name="group_id"
              value={value.group_id ?? ''}
              onChange={(group_id) => onChange({ ...value, group_id })}
              options={items.map((group) => ({ value: group.id, label: group.name }))}
              placeholder="Выберите группу"
              error={errors['audience.group_id'] ?? errors.group_id}
            />
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
    case 'all':
    case 'user':
      return audienceKindLabels[audience.kind];
    case 'faculty':
      return faculty ? `Весь факультет ${faculty}` : audienceKindLabels.faculty;
    case 'course':
      return faculty ? `${audience.course} курс ${faculty}` : `${audience.course} курс`;
    case 'group': {
      const group = groups.data?.find(({ id }) => id === audience.group_id);
      return group ? `Группа ${group.name}` : 'Учебная группа';
    }
  }
}
