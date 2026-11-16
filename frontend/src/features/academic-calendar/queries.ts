import { useQuery } from '@tanstack/react-query';
import { academicApi, unwrap } from '@/api/clients';

export function useAcademicCalendar()
{
    return useQuery({ queryKey: ['academic', 'calendar'], queryFn: () => unwrap(academicApi.GET('/me/academic-calendar')) });
}
