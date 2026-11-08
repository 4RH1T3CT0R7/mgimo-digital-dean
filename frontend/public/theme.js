// Тема до отрисовки React — без белой вспышки в тёмной теме. Отдельным файлом, а не внутри index.html:
// CSP разрешает только скрипты с нашего домена (deploy/Caddyfile). Логика переключения — src/app/theme.ts.
(function () {
  var choice = 'system';
  try {
    choice = localStorage.getItem('theme') || 'system';
  } catch (e) {}
  var dark = choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
