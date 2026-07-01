(function () {
  window.SinoI18nReady = window.SinoI18nCore.initI18n({
    storageKey: 'sinolotes_public_lang',
    defaultLang: 'es',
    supported: ['es', 'zh'],
    files: {
      es: 'assets/i18n/public.es.json',
      zh: 'assets/i18n/public.zh.json'
    }
  });
})();
