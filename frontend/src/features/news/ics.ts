// Файл .ics на одно мероприятие — собирается в браузере (RFC 5545).

/** Текст в значении: обратная косая, точка с запятой, запятая и перевод строки экранируются. */
export function escapeText(value: string) {
  return value.replace(/\r\n|\r/g, '\n').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Строка длиннее 75 байт переносится; многобайтовые символы (кириллица) не разрезаются. */
function fold(line: string) {
  const encoder = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      out += '\r\n ';
      bytes = 1;
    }
    out += char;
    bytes += size;
  }
  return out;
}

/** «20261126T160000» — местное время Москвы. С 2014 года Москва всегда UTC+3, без перехода на летнее время. */
function moscowLocal(value: string | Date) {
  const time = typeof value === 'string' ? Date.parse(value) : value.getTime();
  return new Date(time + 3 * 3_600_000).toISOString().slice(0, 19).replace(/[-:]/g, '');
}

export type IcsEvent = { id: string; title: string; body: string; starts_at: string; place: string };

export function eventIcs(event: IcsEvent, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moy vuz//News//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Moscow', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0300', 'TZNAME:MSK', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${event.id}@moy-vuz`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    `DTSTART;TZID=Europe/Moscow:${moscowLocal(event.starts_at)}`,
    // ponytail: окончания в публикации нет — ставим два часа; появится event_ends_at — брать его.
    'DURATION:PT2H',
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(event.place)}`,
    `DESCRIPTION:${escapeText(event.body)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function downloadIcs(event: IcsEvent) {
  const url = URL.createObjectURL(new Blob([eventIcs(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `event-${moscowLocal(event.starts_at).slice(0, 8)}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari может читать Blob уже после начала скачивания.
  window.setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
