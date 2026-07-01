(function () {
  async function loadJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`i18n load failed: ${path}`);
    return res.json();
  }

  function valueAt(dict, key) {
    return key.split('.').reduce((current, part) => current && current[part], dict);
  }

  function format(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, (_, key) => vars?.[key] ?? '');
  }

  async function initI18n(options) {
    const storageKey = options.storageKey;
    const defaultLang = options.defaultLang;
    const supported = options.supported || ['es', 'zh'];
    const saved = localStorage.getItem(storageKey);
    if (saved && !supported.includes(saved)) localStorage.removeItem(storageKey);
    let lang = supported.includes(saved) ? saved : defaultLang;
    const dictionaries = {};

    async function ensure(code) {
      if (!dictionaries[code]) {
        dictionaries[code] = await loadJson(options.files[code]);
      }
      return dictionaries[code];
    }

    await ensure(defaultLang);
    await ensure(lang);

    function t(key, vars) {
      const active = valueAt(dictionaries[lang] || {}, key);
      const fallback = valueAt(dictionaries[defaultLang] || {}, key);
      return format(active || fallback || key, vars);
    }

    function apply() {
      document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'es-MX';
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
      document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
      document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
      document.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
      document.querySelectorAll('[data-lang-choice]').forEach(btn => {
        const active = btn.dataset.langChoice === lang;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      document.dispatchEvent(new CustomEvent('sinolotes:i18n', { detail: { lang, t } }));
    }

    async function setLang(next) {
      if (!supported.includes(next)) return;
      lang = next;
      localStorage.setItem(storageKey, lang);
      await ensure(lang);
      apply();
    }

    document.addEventListener('click', event => {
      const btn = event.target.closest('[data-lang-choice]');
      if (btn) setLang(btn.dataset.langChoice);
    });

    window.SinoI18n = { t, setLang, getLang: () => lang, apply };
    apply();
    return window.SinoI18n;
  }

  window.SinoI18nCore = { initI18n };
})();
