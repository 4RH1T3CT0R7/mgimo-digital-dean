import { Link } from 'react-router';
import { useLogout } from '@/features/auth/queries';
import { InstallAppButton } from '@/features/pwa/InstallAppButton';
import { askDeanPath } from '@/features/requests/links';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { fundingLabels, studentStatusLabels, studyFormLabels, studyLevelLabels } from './labels';
import { useProfile } from './queries';

export function ProfilePage()
{
    const profile = useProfile();
    const logout = useLogout();

    return (
        <>
            <PageHeader title="Профиль" subtitle="Изменить данные можно только через деканат" />
            <QueryView query={profile} isEmpty={(data) => !data.full_name}
                empty={<EmptyState title="Данные профиля пока не заполнены" description="Обратитесь в деканат, чтобы уточнить сведения об обучении." />}>
                {(data) => (
                    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                        <Section title={data.full_name}>
                            <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
                                {[
                                    ['Факультет', `${data.faculty.name} (${data.faculty.short_name})`],
                                    ['Направление', `${data.program.code} ${data.program.name}`],
                                    ['Степень', studyLevelLabels[data.study_level]],
                                    ['Курс', data.course], ['Академическая группа', data.group.name],
                                    ['Студенческий билет', data.student_card_no], ['Форма обучения', studyFormLabels[data.study_form]],
                                    ['Основа обучения', fundingLabels[data.funding]], ['Год поступления', data.enrollment_year],
                                    ['Статус', studentStatusLabels[data.status]], ['Сокращённое имя', data.short_name],
                                ].map(([label, value]) => (
                                    <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>
                                ))}
                                <div className="min-w-0 sm:col-span-2">
                                    <dt className="text-sm text-muted-foreground">Языковые группы</dt>
                                    <dd className="mt-1">
                                        {data.language_groups.length === 0 ? 'Не назначены' : (
                                            <ul className="flex flex-col gap-2">{data.language_groups.map((group) => <li key={group.id}>{group.name} — {group.language}</li>)}</ul>
                                        )}
                                    </dd>
                                </div>
                            </dl>
                        </Section>
                        <Section title="Мои данные">
                            <p className="text-sm text-muted-foreground">
                                Если в учебных данных есть ошибка,{' '}
                                <Link to={askDeanPath('В моих учебных данных в профиле ошибка: ', 'Другое')} className="font-medium text-primary underline underline-offset-4">сообщите в деканат</Link>.
                            </p>
                            <Link to="/privacy" className="flex min-h-11 items-center text-primary underline underline-offset-4">Как мы обрабатываем ваши данные</Link>
                            <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Выходим…' : 'Выйти'}</Button>
                        </Section>
                    </div>
                )}
            </QueryView>
            <div className="mt-6 max-w-xl">
                <Section title="Приложение">
                    <p className="text-sm text-muted-foreground">Кабинет можно открыть с главного экрана. Для загрузки расписания и оценок нужен интернет.</p>
                    <InstallAppButton />
                </Section>
            </div>
        </>
    );
}
