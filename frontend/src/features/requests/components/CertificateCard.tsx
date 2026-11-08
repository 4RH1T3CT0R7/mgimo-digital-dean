import { CircleCheckIcon, DownloadIcon, ExternalLinkIcon, LoaderCircleIcon } from 'lucide-react';
import { Link } from 'react-router';
import { apiErrorMessage } from '@/shared/lib/errors';
import { formatDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { useDownloadCertificate, type Application } from '../queries';

type Props = { application: Pick<Application, 'id' | 'number' | 'certificate'> };

/** Справка с места учёбы: код проверки, скачивание PDF, ссылка на проверку. */
export function CertificateCard({ application, headingLevel = 'h2' }: Props & { headingLevel?: 'h1' | 'h2' }) {
  const download = useDownloadCertificate(application);
  const certificate = application.certificate;
  if (!certificate) return null;
  const Heading = headingLevel;

  return (
    <section aria-labelledby="certificate-title" className="flex flex-col gap-4 rounded-xl border border-success-strong/25 bg-success-soft p-5">
      <div className="flex items-start gap-3">
        <CircleCheckIcon className="mt-0.5 size-6 shrink-0 text-success-strong" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <Heading id="certificate-title" className={headingLevel === 'h1' ? 'text-2xl font-semibold' : 'text-lg font-semibold'}>
            Справка готова
          </Heading>
          <p className="text-sm text-muted-foreground">
            Действует до {formatDate(certificate.valid_until, { withYear: true })}. Получатель проверит её по коду на странице проверки.
          </p>
        </div>
      </div>
      <p className="flex flex-col gap-0.5">
        <span className="text-sm text-muted-foreground">Код проверки</span>
        <span className="font-mono text-xl font-semibold tracking-widest break-all">{certificate.code}</span>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          disabled={download.isPending}
          onClick={() => download.mutate(undefined, { onError: (err) => toast.error(apiErrorMessage(err)) })}
        >
          {download.isPending ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <DownloadIcon aria-hidden />}
          Скачать PDF
        </Button>
        <Button asChild variant="outline">
          <Link to={certificate.verify_url} target="_blank" rel="noopener">
            <ExternalLinkIcon aria-hidden />
            Открыть проверку
            <span className="sr-only"> (в новой вкладке)</span>
          </Link>
        </Button>
      </div>
    </section>
  );
}
