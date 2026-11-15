import { CircleCheckIcon, ClockIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@/shared/lib/errors';
import { formatDate, plural } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { codeHint, normalizeCode, validCode } from './code';
import { useCertificate } from './queries';

function DemoNote()
{
    return <p className="mt-6 text-sm text-muted-foreground">Это учебный прототип. Справка не является официальным документом.</p>;
}

function AnotherCode()
{
    return <Button asChild variant="outline" className="self-start"><Link to="/verify">Проверить другой код</Link></Button>;
}

export function VerifyFormPage()
{
    const [code, setCode] = useState('');
    const navigate = useNavigate();
    const valid = validCode(code);
    const submit = (event: FormEvent) =>
    {
        event.preventDefault();

        if (valid)
        {
            navigate(`/verify/${code}`);
        }
    };

    return (
        <div className="max-w-2xl">
            <PageHeader title="Проверка справки" subtitle="Введите код, напечатанный на справке" />
            <form onSubmit={submit} className="flex flex-col items-start gap-5 rounded-xl border bg-card p-5 md:p-6">
                <div className="flex w-full flex-col gap-2">
                    <Label htmlFor="certificate-code">Код справки</Label>
                    <Input id="certificate-code" value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                        aria-invalid={code.length > 0 && !valid} aria-describedby="code-hint" className="font-mono tracking-wider" />
                    <p id="code-hint" className={`text-sm ${code.length > 0 && !valid ? 'text-danger-strong' : 'text-muted-foreground'}`}>{codeHint}</p>
                </div>
                <Button type="submit" disabled={!valid}>Проверить</Button>
            </form>
            <DemoNote />
        </div>
    );
}

function CertificateResult({ code }: { code: string })
{
    const certificate = useCertificate(code);
    const error = certificate.error;

    if (!validCode(code))
    {
        return <EmptyState title="Неверный формат кода" description={codeHint} action={<AnotherCode />} />;
    }
    if (error instanceof ApiError && error.status === 404)
    {
        return <EmptyState title="Справка с таким кодом не найдена" description="Проверьте код" action={<AnotherCode />} />;
    }
    if (error instanceof ApiError && error.status === 429)
    {
        const retryAfter = error.retryAfter;
        const message = retryAfter
            ? `Попробуйте через ${retryAfter} ${plural(retryAfter, ['секунду', 'секунды', 'секунд'])}`
            : 'Попробуйте позже';

        return (
            <Section title="Слишком много проверок">
                <p role="alert">{message}</p>
                <AnotherCode />
            </Section>
        );
    }

    return (
        <QueryView query={certificate}>
            {(data) =>
            {
                const Icon = data.valid ? CircleCheckIcon : ClockIcon;
                const title = data.valid ? 'Справка действительна' : 'Срок действия справки истёк';
                const fields = [
                    ['Кому выдана', data.holder],
                    ['Факультет', data.faculty_short],
                    ['Документ', data.title],
                    ['Дата выдачи', formatDate(data.issued_at, { withYear: true })],
                    ['Действительна до', formatDate(data.valid_until, { withYear: true })],
                ];

                return (
                    <div className="flex flex-col gap-5">
                        <Section
                            title={(
                                <span className="flex items-start gap-3">
                                    <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                                    {title}
                                </span>
                            )}
                            className={data.valid ? 'bg-success-soft text-success-strong' : 'bg-warning-soft text-warning-strong'}>
                            <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
                                {fields.map(([label, value]) => (
                                    <div key={label} className="min-w-0">
                                        <dt className="text-sm">{label}</dt>
                                        <dd className="mt-1 font-medium break-words">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </Section>
                        <AnotherCode />
                    </div>
                );
            }}
        </QueryView>
    );
}

export function VerifyResultPage()
{
    const { code = '' } = useParams();

    return (
        <div className="max-w-2xl">
            <PageHeader title="Проверка справки" subtitle={validCode(code) ? `Код ${code}` : 'Проверьте формат кода'} />
            <CertificateResult code={code} />
            <DemoNote />
        </div>
    );
}
