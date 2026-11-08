import { ClockIcon, FileIcon, LoaderCircleIcon, XIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { apiErrorMessage, fieldErrors } from '@/shared/lib/errors';
import { BackLink } from '@/shared/ui/back-link';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { formatSize, slaLabel } from '../labels';
import { useCreateApplication, useServiceTypes, type ServiceType } from '../queries';
import { CertificateCard } from './CertificateCard';
import { FileDrop } from './FileDrop';

type FormField = ServiceType['fields'][number];
type Errors = Record<string, string>;

export function BackToRequests() {
  return <BackLink to="/requests">Все заявки</BackLink>;
}

export function NewRequestPage() {
  const { serviceTypeId } = useParams();
  const serviceTypes = useServiceTypes();
  return (
    <>
      <BackToRequests />
      <QueryView query={serviceTypes}>
        {(list) => {
          const service = list.find((s) => s.id === serviceTypeId);
          if (service) return <ApplicationForm key={service.id} service={service} />;
          return (
            <>
              <PageHeader title="Новая заявка" />
              <EmptyState
                title="Такой услуги нет"
                description="Возможно, она больше не оказывается. Выберите другую из списка."
                action={
                  <Button asChild variant="outline">
                    <Link to="/requests#catalog">К списку услуг</Link>
                  </Button>
                }
              />
            </>
          );
        }}
      </QueryView>
    </>
  );
}

/** Значения из адреса (?purpose=…) — так форму заполняет ИИ-помощник (T26). Чужие варианты select не берём. */
function initialValues(service: ServiceType, params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(
    service.fields.map((f) => {
      const value = (params.get(f.key) ?? '').slice(0, f.max_length ?? undefined);
      return [f.key, f.type === 'select' && !f.options?.includes(value) ? '' : value];
    }),
  );
}

function validate(service: ServiceType, values: Record<string, string>, files: File[]): Errors {
  const errors: Errors = {};
  for (const f of service.fields) {
    if (f.required && !values[f.key]?.trim()) errors[f.key] = f.type === 'select' ? 'Выберите вариант' : 'Заполните поле';
  }
  if (service.attachments.required && files.length === 0) errors.files = 'Приложите хотя бы один файл';
  return errors;
}

function ApplicationForm({ service }: { service: ServiceType }) {
  const [params] = useSearchParams();
  const [values, setValues] = useState(() => initialValues(service, params));
  const [comment, setComment] = useState(() => params.get('comment') ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const create = useCreateApplication();
  const navigate = useNavigate();
  const instant = service.kind === 'instant_certificate';

  if (instant && create.data) {
    return (
      <div className="flex flex-col gap-4">
        <CertificateCard application={create.data.application} headingLevel="h1" />
        <p className="text-sm text-muted-foreground">Справка сохранена в заявке № {create.data.application.number} — её можно скачать снова в любой момент.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link to={`/requests/${create.data.application.id}`}>Открыть заявку</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/requests">К списку заявок</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Ошибки показываем сразу и ставим фокус на первое неверное поле
  function showErrors(next: Errors, form: HTMLFormElement) {
    flushSync(() => setErrors(next));
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }

  function setValue(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    clearError(key);
  }

  function clearError(key: string) {
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validate(service, values, files);
    if (Object.keys(found).length > 0) return showErrors(found, form);
    setErrors({});
    const filled = Object.entries(values)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v);
    create.mutate(
      { service_type_id: service.id, fields: Object.fromEntries(filled), comment: comment.trim() || null, files },
      {
        onSuccess: ({ application, uploadError }) => {
          if (uploadError) toast.error(`Заявка подана, но файл не загрузился: ${apiErrorMessage(uploadError)} Приложите его в заявке.`);
          if (!instant) {
            toast.success(`Заявка № ${application.number} подана`);
            navigate(`/requests/${application.id}`, { replace: true });
          }
        },
        onError: (err) => showErrors(fieldErrors(err), form),
      },
    );
  }

  return (
    <>
      <PageHeader title={service.title} subtitle={service.description} />
      {/* У мгновенной справки срок уже сказан в описании */}
      {!instant && (
        <p className="-mt-3 mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden />
          Срок готовности — {slaLabel(service.sla_days)}
        </p>
      )}
      <Card className="max-w-2xl">
        <CardContent>
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
            {service.fields.map((field) => (
              <FieldControl key={field.key} field={field} value={values[field.key] ?? ''} error={errors[field.key]} onChange={(v) => setValue(field.key, v)} />
            ))}

            {service.kind === 'document' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="comment" className="leading-snug">
                  Комментарий для деканата <Optional />
                </Label>
                <Textarea id="comment" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} aria-invalid={!!errors.comment || undefined} aria-describedby={errors.comment ? 'comment-error' : undefined} />
                <FieldError id="comment-error" error={errors.comment} />
              </div>
            )}

            {service.attachments.allowed && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">
                  Файлы {!service.attachments.required && <Optional />}
                </legend>
                {service.attachments.hint && (
                  <p id="files-hint" className="text-sm text-muted-foreground">
                    {service.attachments.hint}
                  </p>
                )}
                <FileDrop
                  id="files"
                  invalid={!!errors.files}
                  describedBy={[service.attachments.hint && 'files-hint', errors.files && 'files-error'].filter(Boolean).join(' ') || undefined}
                  onAdd={(added) => {
                    setFiles((prev) => [...prev, ...added]);
                    clearError('files');
                  }}
                />
                {files.length > 0 && (
                  <ul aria-label="Выбранные файлы" className="flex flex-col gap-2">
                    {files.map((file, i) => (
                      <li key={`${file.name}-${i}`} className="flex items-center gap-3 rounded-lg border bg-card py-1.5 pr-1.5 pl-3 text-sm">
                        <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatSize(file.size)}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                          <XIcon aria-hidden />
                          <span className="sr-only">Убрать файл {file.name}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <FieldError id="files-error" error={errors.files} />
              </fieldset>
            )}

            {create.isError && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                {apiErrorMessage(create.error)}
              </p>
            )}
            <Button type="submit" size="lg" disabled={create.isPending} className="sm:self-start">
              {create.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
              {create.isPending ? 'Отправляем…' : 'Подать заявку'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function Optional() {
  return <span className="font-normal text-muted-foreground">(необязательно)</span>;
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-danger-strong">
      {error}
    </p>
  );
}

function FieldControl({ field, value, error, onChange }: { field: FormField; value: string; error?: string; onChange: (value: string) => void }) {
  const id = `field-${field.key}`;
  const errorId = `${id}-error`;
  const common = {
    id,
    'aria-invalid': !!error || undefined,
    'aria-describedby': error ? errorId : undefined,
    'aria-required': field.required || undefined,
  };
  const text = {
    ...common,
    value,
    maxLength: field.max_length ?? undefined,
    placeholder: field.placeholder ?? undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="leading-snug">
        {field.label} {!field.required && <Optional />}
      </Label>
      {field.type === 'select' ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger {...common}>
            <SelectValue placeholder={field.placeholder ?? 'Выберите вариант'} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === 'textarea' ? (
        <Textarea {...text} />
      ) : (
        <Input {...text} type={field.type} inputMode={field.type === 'number' ? 'decimal' : undefined} />
      )}
      <FieldError id={errorId} error={error} />
    </div>
  );
}
