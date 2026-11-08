import { UploadIcon } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { cn } from '@/shared/lib/utils';

// Ограничения — docs/contracts/requests.yaml (вложения)
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Почему файл нельзя приложить; null — можно. */
function fileProblem(file: File): string | null {
  if (file.size > MAX_SIZE) return `Файл «${file.name}» больше 5 МБ — уменьшите его или сохраните в другом формате.`;
  if (!TYPES.includes(file.type)) return `Файл «${file.name}» не подходит: можно PDF, JPG или PNG.`;
  return null;
}

/** Выбор файлов кнопкой или перетаскиванием. Размер и тип проверяются до отправки; в onAdd — только подходящие. */
export function FileDrop({
  id,
  onAdd,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  onAdd: (files: File[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [problems, setProblems] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  function add(list: FileList | null) {
    const files = Array.from(list ?? []);
    setProblems(files.map(fileProblem).filter((p) => p !== null));
    const ok = files.filter((f) => !fileProblem(f));
    if (ok.length > 0) onAdd(ok);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    if (!disabled) add(event.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed bg-card px-4 py-5 text-center text-sm transition-colors hover:bg-muted has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
          over && 'border-primary bg-accent',
          invalid && 'border-destructive',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <UploadIcon className="mb-1 size-5 text-muted-foreground" aria-hidden />
        <span>
          Перетащите файлы сюда или <span className="font-medium text-primary underline underline-offset-4">выберите на устройстве</span>
        </span>
        <span className="text-xs text-muted-foreground">PDF, JPG или PNG, до 5 МБ</span>
        <input
          id={id}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="sr-only"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = ''; // тот же файл можно выбрать снова
          }}
        />
      </label>
      {problems.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-danger-strong">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
