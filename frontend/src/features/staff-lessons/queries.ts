import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@/api/academic';
import { academicApi, unwrap } from '@/api/clients';

export function useStaffGroups(facultyId: string | undefined, enabled: boolean)
{
    return useQuery({ queryKey: ['academic', 'staff', 'groups', { facultyId }], enabled,
        queryFn: () => unwrap(academicApi.GET('/staff/groups', { params: { query: { faculty_id: facultyId } } })) });
}

export function useStaffLessons(groupId: string, from: string, to: string)
{
    return useQuery({ queryKey: ['academic', 'staff', 'lessons', { groupId, from, to }], enabled: !!groupId,
        queryFn: () => unwrap(academicApi.GET('/staff/lessons', { params: { query: { group_id: groupId, from, to } } })) });
}

export function useChangeLesson(id: string)
{
    const client = useQueryClient();

    return useMutation({
        mutationFn: (body: components['schemas']['LessonChangeRequest']) => unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', { params: { path: { lesson_id: id } }, body })),
        onSettled: () => client.invalidateQueries({ queryKey: ['academic'] }),
    });
}
