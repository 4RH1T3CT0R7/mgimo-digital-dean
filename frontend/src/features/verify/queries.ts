import { useQuery } from '@tanstack/react-query';
import { requestsApi, unwrap } from '@/api/clients';
import { validCode } from './code';

export function useCertificate(code: string)
{
    return useQuery({
        queryKey: ['requests', 'public', 'certificate', code],
        enabled: validCode(code),
        queryFn: () => unwrap(requestsApi.GET('/public/certificates/{code}', { params: { path: { code } } })),
        gcTime: 0,
        staleTime: 0,
    });
}
