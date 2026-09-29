/* Mandarina · comportamiento de la página (idioma, tema, copiar, navegación). Sin dependencias. */
(function () {
  'use strict';

  var root = document.documentElement;
  var I18N = window.MANDARINA_I18N || { es: {}, en: {} };
  var prefs = window.__MANDARINA_PREFS__ || { theme: 'light', lang: 'es' };
  var state = { lang: prefs.lang, theme: prefs.theme };

  function save(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* modo privado, etc. */ }
  }
  function hasSaved(key) {
    try { return !!window.localStorage.getItem(key); } catch (e) { return false; }
  }
  function t(key) {
    var v = (I18N[state.lang] || {})[key];
    return v !== undefined ? v : (I18N.es || {})[key];
  }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ------------------------------------------------------------------ Tema */
  function applyTheme(theme, persist) {
    state.theme = theme;
    root.classList.toggle('dark', theme === 'dark');

    var icon = document.getElementById('theme-icon');
    var btn = document.getElementById('theme-toggle');
    if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    if (btn) {
      var label = t(theme === 'dark' ? 'ui.theme_to_light' : 'ui.theme_to_dark');
      if (label) { btn.setAttribute('aria-label', label); btn.setAttribute('title', label); }
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e0e10' : '#f8f9ff');
    if (persist) save('mandarina-theme', theme);
  }

  /* ---------------------------------------------------------------- Idioma */
  function applyLang(lang, persist) {
    state.lang = lang;
    root.lang = lang;

    $all('[data-i18n]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (v !== undefined) el.textContent = v;
    });
    $all('[data-i18n-title]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-title'));
      if (v !== undefined) el.setAttribute('title', v);
    });
    $all('[data-i18n-aria]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-aria'));
      if (v !== undefined) el.setAttribute('aria-label', v);
    });

    var title = t('meta.title'), desc = t('meta.description');
    if (title) {
      document.title = title;
      var ogt = document.querySelector('meta[property="og:title"]');
      if (ogt) ogt.setAttribute('content', title);
    }
    if (desc) {
      var d = document.querySelector('meta[name="description"]');
      if (d) d.setAttribute('content', desc);
      var ogd = document.querySelector('meta[property="og:description"]');
      if (ogd) ogd.setAttribute('content', desc);
    }

    $all('[data-lang-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-btn') === lang));
    });

    applyTheme(state.theme, false); // refresca las etiquetas del botón de tema en el nuevo idioma
    root.classList.remove('i18n-pending');
    if (persist) save('mandarina-lang', lang);
  }

  /* ---------------------------------------------------------------- Copiar */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* noop */ }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  $all('[data-copy-from]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var src = document.querySelector(btn.getAttribute('data-copy-from'));
      if (!src) return;
      var text = src.textContent.replace(/\s+/g, ' ').trim();   // se copia exactamente lo que se ve
      copyText(text).then(function () {
        var label = btn.hasAttribute('data-i18n') ? btn : btn.querySelector('[data-i18n]');
        if (!label) return;
        label.textContent = t('ui.copied');
        clearTimeout(btn._timer);
        btn._timer = setTimeout(function () { label.textContent = t(label.getAttribute('data-i18n')); }, 2000);
      }).catch(function () { /* sin permisos de portapapeles: no hacemos nada */ });
    });
  });

  /* ---------------------------------------- Menú: marca la sección visible */
  var links = {};
  $all('.nav-link[data-nav]').forEach(function (a) { links[a.getAttribute('data-nav')] = a; });
  function setActive(id) {
    Object.keys(links).forEach(function (k) {
      if (k === id) links[k].setAttribute('aria-current', 'true');
      else links[k].removeAttribute('aria-current');
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-30% 0px -60% 0px' });
    Object.keys(links).concat('top').forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  /* ---------------------------------------------------------------- Eventos */
  $all('[data-lang-btn]').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang-btn'), true); });
  });
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark', true);
  });
  // Si la persona no ha elegido tema, seguimos los cambios del sistema
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) { if (!hasSaved('mandarina-theme')) applyTheme(e.matches ? 'dark' : 'light', false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }

  applyLang(state.lang, false);
  applyTheme(state.theme, false);
})();
