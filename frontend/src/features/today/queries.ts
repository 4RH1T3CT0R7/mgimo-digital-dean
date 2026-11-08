import { useQuery } from '@tanstack/react-query';
import { academicApi, unwrap } from '@/api/clients';

/** Расписание текущей недели (без параметров API отдаёт текущую неделю). */
export function useWeekSchedule() {
  return useQuery({
    queryKey: ['academic', 'schedule', 'current-week'],
    queryFn: () => unwrap(academicApi.GET('/me/schedule')),
  });
}
