/* Se ejecuta ANTES de pintar la página: decide tema e idioma para evitar parpadeos.
   Prioridad:  ?theme= / ?lang= en la URL  >  elección guardada  >  preferencia del sistema/navegador. */
(function () {
  var root = document.documentElement;

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function param(name) {
    try { return (new URLSearchParams(window.location.search).get(name) || '').toLowerCase(); } catch (e) { return ''; }
  }

  var theme = param('theme') || read('mandarina-theme');
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  var lang = param('lang') || read('mandarina-lang');
  if (lang !== 'es' && lang !== 'en') {
    lang = (navigator.language || 'es').toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
  }

  root.classList.toggle('dark', theme === 'dark');
  root.lang = lang;
  // El HTML está escrito en español: solo hay que traducir (y ocultar un instante) si el idioma es otro.
  if (lang !== 'es') root.classList.add('i18n-pending');

  window.__MANDARINA_PREFS__ = { theme: theme, lang: lang };
})();
