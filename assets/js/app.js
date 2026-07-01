const DATA_ROOT = location.pathname.includes('/admin/') ? '../data/' : 'data/';
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value) || 0);
let currentLotes = [];
const BUYER_PROFILE_KEY = 'sinolotes_buyer_profile';
const BUYER_REQUESTS_KEY = 'sinolotes_buyer_requests';
const publicT = (key, vars) => window.SinoI18n?.t(key, vars) || ({
  'card.city': 'Ciudad', 'card.price': 'Precio', 'card.stock': 'Inventario', 'card.from': 'Desde', 'card.quote': 'A cotizar',
  'price.hidden': 'Precio por cotización', 'price.volume': 'Precio especial por volumen', 'price.validUntil': 'Precio válido hasta {date}',
  'card.wa': 'Solicitar disponibilidad', 'card.detail': 'Ver detalle', 'card.back': 'Volver a lotes',
  'card.notice': 'Nota: este lote solo recibe solicitudes. La plataforma confirma proveedor, inventario, cotización final y entrega antes del pago.',
  'lotes.empty': 'No hay lotes para este filtro. Prueba otra categoría o ciudad.'
}[key] || key);
const normalizeKey = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const categoryName = id => {
  const key = normalizeKey(id);
  const aliases = {
    electronica: 'electronica',
    electronics: 'electronica',
    home: 'hogar',
    tools: 'herramientas',
    mixto: 'otros',
    mixed: 'otros'
  };
  const normalized = aliases[key] || key;
  const translated = window.SinoI18n?.t(`category.${key}`);
  if (translated && translated !== `category.${key}`) return translated;
  const normalizedTranslated = window.SinoI18n?.t(`category.${normalized}`);
  if (normalizedTranslated && normalizedTranslated !== `category.${normalized}`) return normalizedTranslated;
  return publicT('fallback.category');
};
const statusName = id => window.SinoI18n?.t(`status.${id}`) || id || '';
const categoryBadge = lote => {
  const lang = window.SinoI18n?.getLang?.() || 'es';
  return (lang === 'zh' ? lote.categoryZh : lote.categoryEs) || categoryName(lote.category);
};

async function getJson(name) {
  const res = await fetch(`${DATA_ROOT}${name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo cargar ${name}`);
  return res.json();
}

function setupMenu() {
  const btn = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('.nav-links');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
}

function whatsappText(lote) {
  const title = publicTitle(lote);
  const message = `Hola, quiero cotizar este lote:
ID: ${lote.id}
Producto: ${title}
Cantidad:
Ciudad: ${lote.city}`;
  return encodeURIComponent(message);
}

function readJsonLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJsonLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function optionalPublicApi(path, payload) {
  const base = window.SINOLOTES_PUBLIC_API_BASE;
  if (!base) return null;
  try {
    const res = await fetch(`${String(base).replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok ? res.json() : null;
  } catch (error) {
    return null;
  }
}

function deliverySummary(profile) {
  if (!profile) return '';
  return [
    profile.recipientName,
    profile.recipientWhatsapp,
    profile.street && profile.externalNumber ? `${profile.street} ${profile.externalNumber}${profile.internalNumber ? ` Int. ${profile.internalNumber}` : ''}` : '',
    profile.colonia,
    profile.deliveryCity || profile.city,
    profile.state,
    profile.deliveryPostalCode || profile.postalCode,
    profile.addressReference
  ].filter(Boolean).join(' · ');
}

function publicTitle(lote) {
  const lang = window.SinoI18n?.getLang?.() || 'es';
  const zhTitle = lote.titleZh || lote.titleCn;
  const esTitle = lote.titleEs;
  return (lang === 'zh' ? zhTitle : esTitle) || publicT('fallback.title');
}

function publicDescription(lote) {
  const lang = window.SinoI18n?.getLang?.() || 'es';
  const zhDescription = lote.descriptionZh || lote.descriptionCn;
  const esDescription = lote.descriptionEs;
  return (lang === 'zh' ? zhDescription : esDescription) || publicT('fallback.description');
}

function publicPriceInfo(lote) {
  const lang = window.SinoI18n?.getLang?.() || 'es';
  const label = lang === 'zh' ? lote.publicPriceLabelZh : lote.publicPriceLabelEs;
  const note = lang === 'zh' ? lote.priceNoteZh : lote.priceNoteEs;
  if (!lote.showPrice || lote.priceMode === 'hidden') {
    return { label: label || publicT('price.hidden'), note: note || publicT('card.quote') };
  }
  if (lote.priceMode === 'range' && lote.priceFrom && lote.priceTo) {
    return { label: label || `${money(lote.priceFrom)}–${money(lote.priceTo)} ${lote.currency || 'MXN'}`, note: note || publicT('price.rangeNote') };
  }
  if (lote.priceMode === 'volume') {
    return { label: label || publicT('price.volume'), note: note || publicT('price.volumeNote') };
  }
  return { label: label || `${publicT('card.from')} ${money(lote.priceFrom || lote.publicPrice)}`, note: note || publicT('price.note') };
}

function priceBlock(lote) {
  const info = publicPriceInfo(lote);
  const expiry = lote.priceExpiresAt ? `<small>${publicT('price.validUntil', { date: lote.priceExpiresAt })}</small>` : '';
  return `<div class="price-block ${lote.showPrice ? 'show' : 'quote'}"><strong>${info.label}</strong><span>${info.note || ''}</span>${expiry}</div>`;
}

function loteImage(lote, title, mode = 'card') {
  const image = lote.images?.[0];
  if (image) return `<img src="${image}" alt="${title}">`;
  return `<div class="image-placeholder ${mode}"><strong>${publicT('card.imagePending')}</strong></div>`;
}

function publicLoteCard(lote) {
  const title = publicTitle(lote);
  return `<article class="lote-card public-card">
    <div class="media-frame">
      <span class="deal-badge">${publicT('card.dealBadge')}</span>
      ${loteImage(lote, title)}
    </div>
    <div class="card-body">
      <div class="card-head"><span>${lote.id}</span><b>${categoryBadge(lote)}</b></div>
      <h3>${title}</h3>
      <div class="card-meta-row"><span class="status ${lote.status}">${statusName(lote.status)}</span><span>${publicT('card.wholesale')}</span></div>
      ${priceBlock(lote)}
      <p>${publicDescription(lote)}</p>
      <dl>
        <div><dt>${publicT('card.city')}</dt><dd>${lote.city}</dd></div>
        <div><dt>MOQ</dt><dd>${lote.moq}</dd></div>
        <div><dt>${publicT('card.price')}</dt><dd>${publicPriceInfo(lote).label}</dd></div>
        <div><dt>${publicT('card.stock')}</dt><dd>${lote.stock}</dd></div>
      </dl>
      <div class="card-actions">
        <a class="btn btn-primary" href="buyer-request.html?lote=${encodeURIComponent(lote.id)}&product=${encodeURIComponent(title)}">${publicT('card.wa')}</a>
        <a class="btn btn-secondary" href="lote-demo.html?id=${encodeURIComponent(lote.id)}">${publicT('card.detail')}</a>
      </div>
      <small>${publicT('card.updated', { date: lote.updatedAt })}</small>
    </div>
  </article>`;
}

function renderFeatured(lotes) {
  const target = document.querySelector('[data-featured-lotes]');
  if (!target) return;
  target.innerHTML = lotes.slice(0, 6).map(publicLoteCard).join('');
}

function renderPriceFeatured(lotes) {
  const target = document.querySelector('[data-price-lotes]');
  if (!target) return;
  const rows = lotes.filter(l => l.showPrice && l.priceMode !== 'hidden').slice(0, 6);
  target.innerHTML = rows.map(publicLoteCard).join('');
}

function renderCatalog(lotes) {
  const target = document.querySelector('[data-lotes-grid]');
  if (!target) return;
  const search = document.querySelector('[data-filter-search]');
  const category = document.querySelector('[data-filter-category]');
  const city = document.querySelector('[data-filter-city]');
  const status = document.querySelector('[data-filter-status]');
  const initialQuery = new URLSearchParams(location.search).get('q');
  if (search && initialQuery) search.value = initialQuery;
  const run = () => {
    const q = (search?.value || '').toLowerCase();
    const rows = lotes.filter(l => {
      const hay = `${l.id} ${l.titleEs || ''} ${l.titleZh || ''} ${l.titleCn || ''} ${l.descriptionEs || ''} ${l.descriptionZh || ''} ${l.category || ''} ${l.categoryEs || ''} ${l.categoryZh || ''} ${l.city} ${l.stock} ${l.status}`.toLowerCase();
      return (!q || hay.includes(q))
        && (!category?.value || normalizeKey(l.category) === category.value)
        && (!city?.value || l.city === city.value)
        && (!status?.value || l.status === status.value);
    });
    target.innerHTML = rows.length ? rows.map(publicLoteCard).join('') : `<div class="empty-state">${publicT('lotes.empty')}</div>`;
    const count = document.querySelector('[data-result-count]');
    if (count) count.textContent = publicT('lotes.count', { count: rows.length });
    const total = document.querySelector('[data-catalog-total]');
    if (total) total.textContent = rows.length;
  };
  [search, category, city, status].forEach(el => el?.addEventListener('input', run));
  run();
}

function renderDetail(lotes) {
  const target = document.querySelector('[data-lote-detail]');
  if (!target) return;
  const id = new URLSearchParams(location.search).get('id') || lotes[0]?.id;
  const lote = lotes.find(l => l.id === id) || lotes[0];
  if (!lote) return;
  const title = publicTitle(lote);
  target.innerHTML = `<div class="detail-grid marketplace-detail">
    <div class="detail-media">${loteImage(lote, title, 'detail')}</div>
    <div class="detail-copy">
      <span class="eyebrow">${categoryBadge(lote)} · ${lote.id}</span>
      <h1>${title}</h1>
      <p>${publicDescription(lote)}</p>
      <div class="spec-grid">
        <div><span>${publicT('publish.category')}</span><strong>${categoryBadge(lote)}</strong></div>
        <div><span>${publicT('card.city')}</span><strong>${lote.city}</strong></div>
        <div><span>MOQ</span><strong>${lote.moq}</strong></div>
        <div><span>${publicT('card.price')}</span><strong>${publicPriceInfo(lote).label}</strong></div>
        <div><span>${publicT('card.stock')}</span><strong>${lote.stock}</strong></div>
      </div>
      <div class="buy-box">
        ${priceBlock(lote)}
        <div class="notice">${publicT('card.notice')}</div>
        <div class="card-actions">
          <a class="btn btn-secondary" href="buyer-request.html?lote=${encodeURIComponent(lote.id)}&product=${encodeURIComponent(title)}">${publicT('buyerRequest.submit')}</a>
          <a class="btn btn-secondary" href="lotes.html">${publicT('card.back')}</a>
        </div>
        <small>${publicT('card.updated', { date: lote.updatedAt })}</small>
      </div>
    </div>
  </div>`;
  document.title = `${title} | SinoLotes`;
}

function setupBuyerProfileForm() {
  const form = document.querySelector('[data-buyer-profile-form]');
  if (!form) return;
  const saved = readJsonLocal(BUYER_PROFILE_KEY, null);
  if (saved) {
    Object.entries(saved).forEach(([key, value]) => {
      if (form.elements[key] && value !== undefined && value !== null) form.elements[key].value = value;
    });
  }
  let action = 'save';
  form.querySelectorAll('[data-buyer-action]').forEach(button => {
    button.addEventListener('click', () => { action = button.dataset.buyerAction || 'save'; });
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const profile = Object.fromEntries(new FormData(form));
    profile.id = saved?.id || `BUY-${Date.now()}`;
    profile.createdAt = saved?.createdAt || new Date().toISOString();
    profile.updatedAt = new Date().toISOString();
    writeJsonLocal(BUYER_PROFILE_KEY, profile);
    optionalPublicApi('/api/public/buyer-profile', profile);
    const msg = document.querySelector('[data-buyer-profile-message]');
    if (msg) {
      msg.textContent = publicT('buyer.success');
      msg.className = 'form-message ok';
    }
    if (action === 'request') window.location.href = 'buyer-request.html';
  });
}

function setupBuyerRequestForm() {
  const form = document.querySelector('[data-buyer-request-form]');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  const profile = readJsonLocal(BUYER_PROFILE_KEY, null);
  const status = document.querySelector('[data-buyer-request-status]');
  if (profile) {
    if (form.elements.whatsapp) form.elements.whatsapp.value = profile.whatsapp || '';
    if (form.elements.city) form.elements.city.value = profile.city || '';
    if (form.elements.postalCode) form.elements.postalCode.value = profile.postalCode || profile.deliveryPostalCode || '';
    if (form.elements.deliverySummary) form.elements.deliverySummary.value = deliverySummary(profile);
    if (status) {
      status.textContent = publicT('buyerRequest.loaded');
      status.classList.add('ok');
    }
  } else if (status) {
    status.textContent = publicT('buyerRequest.missing');
    status.classList.add('warn');
  }
  if (form.elements.loteId) form.elements.loteId.value = params.get('lote') || '';
  if (form.elements.product) form.elements.product.value = params.get('product') || '';
  form.addEventListener('submit', event => {
    event.preventDefault();
    const request = Object.fromEntries(new FormData(form));
    request.id = `REQ-${Date.now()}`;
    request.createdAt = new Date().toISOString();
    request.buyerProfile = profile;
    const requests = readJsonLocal(BUYER_REQUESTS_KEY, []);
    writeJsonLocal(BUYER_REQUESTS_KEY, [request, ...requests]);
    optionalPublicApi('/api/public/buyer-request', request);
    const msg = document.querySelector('[data-buyer-request-message]');
    if (msg) {
      msg.textContent = publicT('buyerRequest.success');
      msg.className = 'form-message ok';
    }
  });
}

function setupPublishForm() {
  const form = document.querySelector('[data-publish-form]');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const required = (form.dataset.requiredFields || 'company,whatsapp,city,title,category,quantity,moq')
      .split(',')
      .map(field => field.trim())
      .filter(Boolean);
    const missing = required.filter(key => !String(data[key] || '').trim());
    const msg = document.querySelector('[data-form-message]');
    if (missing.length) {
      msg.textContent = publicT('publish.missing', { fields: missing.join(', ') });
      msg.className = 'form-message error';
      return;
    }
    msg.textContent = publicT('publish.success');
    msg.className = 'form-message ok';
    form.reset();
  });
}

async function init() {
  if (window.SinoI18nReady) await window.SinoI18nReady.catch(() => {});
  setupMenu();
  setupPublishForm();
  setupBuyerProfileForm();
  setupBuyerRequestForm();
  const lotesDataName = document.body?.dataset?.lotesSource || 'lotes';
  currentLotes = await getJson(lotesDataName).catch(() => []);
  renderFeatured(currentLotes);
  renderPriceFeatured(currentLotes);
  renderCatalog(currentLotes);
  renderDetail(currentLotes);
  document.addEventListener('sinolotes:i18n', () => {
    renderFeatured(currentLotes);
    renderPriceFeatured(currentLotes);
    renderCatalog(currentLotes);
    renderDetail(currentLotes);
  });
  document.addEventListener('click', e => {
    const id = e.target?.dataset?.waCopy;
    if (!id) return;
    const lote = currentLotes.find(l => l.id === id);
    navigator.clipboard?.writeText(decodeURIComponent(whatsappText(lote))).catch(()=>{});
    e.target.textContent = publicT('card.copied');
  });
}

init();
