import { useQuery } from '@tanstack/react-query';
import { academicApi, unwrap } from '@/api/clients';

export function useGradesSummary()
{
    return useQuery({ queryKey: ['academic', 'grades', 'summary'], queryFn: () => unwrap(academicApi.GET('/me/grades/summary')) });
}

export function useCurrentGrades()
{
    return useQuery({ queryKey: ['academic', 'grades', 'current'], queryFn: () => unwrap(academicApi.GET('/me/grades/current')) });
}

export function useSessionResults()
{
    return useQuery({ queryKey: ['academic', 'grades', 'sessions'], queryFn: () => unwrap(academicApi.GET('/me/grades/sessions')) });
}
