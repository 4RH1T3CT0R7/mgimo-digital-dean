import { useQuery } from '@tanstack/react-query';
import { requestsApi, unwrap } from '@/api/clients';

/** QR рисует сервер (requests): во фронтенде нет библиотеки QR */
export const QR_URL = '/api/requests/me/student-card/qr.png';

export function useStudentCard() {
  return useQuery({
    queryKey: ['requests', 'student-card'],
    queryFn: () => unwrap(requestsApi.GET('/me/student-card')),
  });
}
