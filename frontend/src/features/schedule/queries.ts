import { useQuery } from '@tanstack/react-query';
import { academicApi, unwrap } from '@/api/clients';
import type { components } from '@/api/academic';

export type Lesson = components['schemas']['Lesson'];

export function useSchedule(from: string, to: string)
{
    return useQuery({
        queryKey: ['academic', 'schedule', { from, to }],
        queryFn: () => unwrap(academicApi.GET('/me/schedule', { params: { query: { from, to } } })),
    });
}
