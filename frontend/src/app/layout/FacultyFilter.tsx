import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { academicApi, unwrap } from '@/api/clients';
import { useMe } from '@/features/auth/queries';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const ALL = 'all';

/**
 * Фильтр факультета для администратора — только там, где API принимает `faculty_id`
 * (`/staff/applications`, `/staff/groups`). Значение хранится в адресе: `?faculty_id=…`.
 * Для staff всегда `undefined`: сервер сам ограничивает данные своим факультетом.
 */
export function useFacultyFilter(): string | undefined {
  const [params] = useSearchParams();
  return params.get('faculty_id') ?? undefined;
}

export function FacultyFilter() {
  const isAdmin = useMe().data?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const faculties = useQuery({
    queryKey: ['academic', 'faculties'],
    queryFn: () => unwrap(academicApi.GET('/faculties')),
    enabled: isAdmin,
    staleTime: Infinity,
  });
  if (!isAdmin) return null;

  function onChange(value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === ALL) next.delete('faculty_id');
      else next.set('faculty_id', value);
      return next;
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-64">
      <Label htmlFor="faculty-filter">Факультет</Label>
      <Select value={params.get('faculty_id') ?? ALL} onValueChange={onChange} disabled={!faculties.data}>
        <SelectTrigger id="faculty-filter">
          <SelectValue placeholder="Все факультеты" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все факультеты</SelectItem>
          {faculties.data?.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.short_name} — {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
