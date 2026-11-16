import { useQuery } from '@tanstack/react-query';
import { notificationsApi, requestsApi, unwrap } from '@/api/clients';

export function useRecentApplications()
{
    return useQuery({
        queryKey: ['requests', 'applications', { limit: 3 }],
        queryFn: () => unwrap(requestsApi.GET('/me/applications', { params: { query: { limit: 3 } } })),
    });
}

/** Заявки, где деканат просит уточнить, — для блока «Ждёт вашего действия» */
export function useApplicationsNeedingInfo()
{
    return useQuery({
        queryKey: ['requests', 'applications', { status: 'needs_info' }],
        queryFn: () => unwrap(requestsApi.GET('/me/applications', { params: { query: { status: ['needs_info'], limit: 10 } } })),
    });
}

export function useUpcomingDeadlines()
{
    return useQuery({
        queryKey: ['notifications', 'deadlines', { days: 7 }],
        queryFn: () => unwrap(notificationsApi.GET('/me/deadlines', { params: { query: { days: 7 } } })),
    });
}
