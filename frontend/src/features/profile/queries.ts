import { useQuery } from '@tanstack/react-query';
import { academicApi, unwrap } from '@/api/clients';

export function useProfile()
{
    return useQuery({
        queryKey: ['academic', 'profile'],
        queryFn: () => unwrap(academicApi.GET('/me/profile')),
    });
}
