import { readFileSync } from 'node:fs';

const faculties = ['ФМО', 'МЭО'];
const audiences = ['all', ...faculties];
const serviceIds = [
  'study-certificate',
  'military-certificate',
  'transcript',
  'financial-aid',
  'academic-leave',
  'student-card-reissue',
  'dean-question',
];
const servicesWithAttachments = new Set(['financial-aid', 'academic-leave', 'dean-question']);
const deadlineKeys = ['financial-aid', 'coursework', 'credit-public-international-law', 'credit-english', 'exam'];
const uiKeys = [
  'today.no_lessons',
  'schedule.empty_week',
  'grades.empty',
  'requests.empty',
  'notifications.empty',
  'deadlines.empty',
  'staff.inbox_empty',
  'error.generic',
  'error.offline',
  'not_found',
];
const segmenter = new Intl.Segmenter('ru', { granularity: 'sentence' });
const errors = [];

function report(location, message) {
  errors.push(`${location}: ${message}`);
}

function read(name) {
  try {
    return readFileSync(new URL(name, import.meta.url), 'utf8');
  } catch (error) {
    report(name, `не удалось прочитать файл (${error.code ?? error.message})`);
    return undefined;
  }
}

function checkJsonKeys(source, name) {
  const objects = [];
  // После JSON.parse достаточно найти границы объектов и имена полей.
  // Обычные строки пропускаем целиком, а имена декодируем перед сравнением.
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"(\s*:)?|[{}]/gs)) {
    if (match[0] === '{') {
      objects.push(new Set());
    } else if (match[0] === '}') {
      objects.pop();
    } else if (match[1]) {
      const key = JSON.parse(match[0].slice(0, -match[1].length));
      const keys = objects.at(-1);
      if (keys.has(key)) {
        const line = source.slice(0, match.index).split('\n').length;
        report(`${name}:${line}`, `повторяющийся ключ ${JSON.stringify(key)}`);
      }
      keys.add(key);
    }
  }
}

function checkJson(name, validate) {
  const source = read(name);
  if (source === undefined) return;
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    report(name, `невалидный JSON (${error.message})`);
    return;
  }
  checkJsonKeys(source, name);
  validate(value, name);
}

function checkObject(value, location, required, allowExtra = false) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    report(location, 'ожидается объект');
    return false;
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) report(`${location}.${key}`, 'отсутствует обязательное поле');
  }
  if (!allowExtra) {
    for (const key of Object.keys(value)) {
      if (!required.includes(key)) report(`${location}.${key}`, 'непредусмотренное поле');
    }
  }
  return true;
}

function checkText(value, location, maxLength = Infinity) {
  if (typeof value !== 'string' || !value.trim()) {
    report(location, 'ожидается непустой текст');
    return false;
  }
  if ([...value].length > maxLength) report(location, `длина превышает ${maxLength} символов`);
  return true;
}

function checkSentences(value, location, min, max) {
  const sentences = [...segmenter.segment(value.trim())];
  if (sentences.length < min || sentences.length > max ||
      sentences.some(({ segment }) => !/[.!?…][»”"’')\]]*$/u.test(segment.trimEnd()))) {
    report(location, `нужно полных предложений: от ${min} до ${max}`);
  }
}

function checkUnique(seen, value, location) {
  if (typeof value !== 'string' || !value.trim()) return;
  const normalized = value.normalize('NFC').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  if (seen.has(normalized)) report(location, `дубликат значения из ${seen.get(normalized)}`);
  else seen.set(normalized, location);
}

function checkDate(value, location) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    report(location, 'ожидается дата в формате ГГГГ-ММ-ДД');
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    report(location, 'такой календарной даты нет');
  } else if (value < '2026-11-01' || value > '2026-11-21') {
    // Публикация позже показа жюри выглядит в ленте как «новость из будущего».
    report(location, 'дата публикации должна быть с 1 по 21 ноября 2026 включительно');
  }
}

function checkRows(value, name, count, fields, validateRow) {
  if (!Array.isArray(value)) {
    report(name, 'ожидается массив записей');
    return;
  }
  if (value.length !== count) report(name, `ожидается ${count} записей, найдено ${value.length}`);
  const titles = new Map();
  value.forEach((row, index) => {
    const location = `${name}[${index}]`;
    if (checkObject(row, location, fields)) {
      checkUnique(titles, row.title, `${location}.title`);
      validateRow(row, location);
    }
  });
}

function checkNews(value, name) {
  const counts = new Map(audiences.map((audience) => [audience, 0]));
  const bodies = new Map();
  checkRows(value, name, 6, ['title', 'body', 'audience', 'date'], (row, location) => {
    checkText(row.title, `${location}.title`, 120);
    if (checkText(row.body, `${location}.body`, 1000) &&
        /<\/?[a-z][^>]*>|\[[^\]]+\]\([^)]*\)|^\s*(?:#{1,6}|>|[-+*])\s|\*\*[^*]+\*\*|`[^`]+`/imu.test(row.body)) {
      report(`${location}.body`, 'ожидается обычный текст без разметки');
    }
    checkUnique(bodies, row.body, `${location}.body`);
    if (counts.has(row.audience)) counts.set(row.audience, counts.get(row.audience) + 1);
    else report(`${location}.audience`, 'допустимы all, ФМО и МЭО');
    checkDate(row.date, `${location}.date`);
  });
  for (const [audience, count] of counts) {
    const minimum = audience === 'all' ? 2 : 1;
    if (count < minimum) report(name, `для аудитории ${audience} нужно не менее ${minimum} новостей`);
  }
}

function checkAnnouncements(value, name) {
  const counts = new Map(faculties.map((faculty) => [faculty, { important: 0, regular: 0 }]));
  const bodies = new Map();
  checkRows(value, name, 4, ['title', 'body', 'faculty', 'important', 'requires_ack', 'date'], (row, location) => {
    checkText(row.title, `${location}.title`);
    checkText(row.body, `${location}.body`);
    checkUnique(bodies, row.body, `${location}.body`);
    const faculty = counts.get(row.faculty);
    if (!faculty) report(`${location}.faculty`, 'допустимы ФМО и МЭО');
    for (const field of ['important', 'requires_ack']) {
      if (typeof row[field] !== 'boolean') report(`${location}.${field}`, 'ожидается true или false');
    }
    if (row.important === true && row.requires_ack === true) {
      if (faculty) faculty.important += 1;
    } else if (row.important === false && row.requires_ack === false) {
      if (faculty) faculty.regular += 1;
    } else if (typeof row.important === 'boolean' && typeof row.requires_ack === 'boolean') {
      report(location, 'важное объявление требует подтверждения, обычное — нет');
    }
    checkDate(row.date, `${location}.date`);
  });
  for (const [faculty, count] of counts) {
    if (count.important !== 1 || count.regular !== 1) {
      report(name, `для ${faculty} нужно одно важное объявление с подтверждением и одно обычное`);
    }
  }
}

function checkServices(value, name) {
  if (!checkObject(value, name, serviceIds)) return;
  const descriptions = new Map();
  for (const id of serviceIds) {
    if (!Object.hasOwn(value, id)) continue;
    const location = `${name}.${id}`;
    const service = value[id];
    if (!checkObject(service, location, ['description', 'hint', 'attachments_hint'])) continue;
    if (checkText(service.description, `${location}.description`)) {
      checkUnique(descriptions, service.description, `${location}.description`);
      checkSentences(service.description, `${location}.description`, 1, 2);
    }
    if (service.hint !== null) checkText(service.hint, `${location}.hint`);
    if (!servicesWithAttachments.has(id)) {
      if (service.attachments_hint !== null) report(`${location}.attachments_hint`, 'для этой услуги вложения недоступны, ожидается null');
    } else if (service.attachments_hint !== null) {
      checkText(service.attachments_hint, `${location}.attachments_hint`);
    }
  }
}

function checkDeadlines(value, name) {
  const keys = new Map();
  checkRows(value, name, deadlineKeys.length, ['key', 'title', 'description'], (row, location) => {
    checkUnique(keys, row.key, `${location}.key`);
    if (!deadlineKeys.includes(row.key)) report(`${location}.key`, 'неизвестный ключ дедлайна');
    checkText(row.title, `${location}.title`);
    checkText(row.description, `${location}.description`, 300);
  });
  for (const key of deadlineKeys) {
    if (!keys.has(key)) report(name, `отсутствует дедлайн ${key}`);
  }
}

function checkUiTexts(value, name) {
  if (!checkObject(value, name, uiKeys, true)) return;
  for (const [key, state] of Object.entries(value)) {
    const location = `${name}.${key}`;
    if (!checkObject(state, location, ['title', 'description'])) continue;
    checkText(state.title, `${location}.title`);
    checkText(state.description, `${location}.description`);
  }
}

function checkFaq() {
  const name = 'faq.md';
  const source = read(name);
  if (source === undefined) return;
  const markdown = source.replace(/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g, '');
  const blocks = markdown.trim() ? markdown.split(/\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*/) : [];
  if (blocks.length !== 25) report(name, `ожидается 25 записей, найдено ${blocks.length}`);
  const ids = new Map();
  const questions = new Map();
  const answers = new Map();
  blocks.forEach((block, index) => {
    const location = `${name}, запись ${index + 1}`;
    const [heading, ...lines] = block.split(/\r?\n/);
    const match = /^## ([a-z][a-z0-9]*(?:-[a-z0-9]+)*): (\S.*\?)$/.exec(heading);
    if (!match) report(location, 'ожидается заголовок «## id-латиницей: Вопрос?»');
    else {
      checkUnique(ids, match[1], `${location} (ID)`);
      checkUnique(questions, match[2], `${location} (вопрос)`);
    }

    const link = /^Услуга: (\S+)$/.exec(lines.pop() ?? '');
    if (!link || (link[1] !== 'нет' && !serviceIds.includes(link[1]))) {
      report(location, 'последняя строка должна содержать «Услуга:» и ID из каталога или «нет» без кавычек');
    }

    const answer = lines.map((line) => line.trim()).join(' ');
    if (lines.some((line) => /^\s*(?:#|Услуга:)/.test(line))) {
      report(location, 'внутри ответа найден заголовок или повторная строка «Услуга:»');
    }
    if (checkText(answer, `${location} (ответ)`)) checkSentences(answer, `${location} (ответ)`, 2, 5);
    checkUnique(answers, answer, `${location} (ответ)`);
  });
}

checkJson('news.json', checkNews);
checkJson('announcements.json', checkAnnouncements);
checkJson('services.json', checkServices);
checkJson('deadlines.json', checkDeadlines);
checkFaq();
checkJson('ui-texts.json', checkUiTexts);

if (errors.length > 0) {
  console.error(`Проверка T19 не пройдена (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('T19: проверка пройдена — 6 новостей, 4 объявления, 7 услуг, 5 дедлайнов, 25 вопросов FAQ, 10 обязательных состояний интерфейса.');
}
