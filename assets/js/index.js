import {
  usd, km, krwM, KEY_FEATURES, featureState, encarUrl, MARKS, photoUrl,
  initTheme, esc, swatch, BUDGET_CAP, LADDER_FLOOR,
} from './common.js';

const $ = (sel) => document.querySelector(sel);

let cars = [];
let meta = {};

init();

async function init() {
  initTheme();
  let data;
  try {
    const res = await fetch('data/cars.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    $('#state').textContent = 'Не вдалося завантажити data/cars.json. Онови сторінку або перевір зʼєднання.';
    return;
  }
  cars = data.cars;
  meta = data.meta;
  renderFigures(meta, cars);
  fillColors(cars);
  $('#controls').addEventListener('change', render);
  $('#state').hidden = true;
  $('#ladder').hidden = false;
  render();
}

function renderFigures(meta, list) {
  const cheapest = Math.min(...list.map((c) => c.priceUSD));
  const decoded = list.filter((c) => c.decoded).length;
  const x5 = list.filter((c) => c.model.startsWith('X5')).length;
  const known = list.map(airState).filter((a) => a !== null);
  const knownAir = known.length;
  const withAir = known.filter(Boolean).length;
  const updated = new Date(meta.updated).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#figures').innerHTML = [
    ['Кандидатів у списку', `${list.length}`, true],
    ['X5 · X6', `${x5} · ${list.length - x5}`, true],
    ['Найдешевше під ключ', usd(cheapest), true],
    ['Стеля бюджету', usd(BUDGET_CAP), true],
    ['Комплектація за VIN', `${decoded} з ${list.length}`, true],
    ['Пневмопідвіска', `${withAir} з ${knownAir}`, true],
    ['Дані станом на', updated, false],
  ].map(([dt, dd, isNum]) =>
    `<div><dt>${esc(dt)}</dt><dd${isNum ? ' class="num"' : ''}>${esc(dd)}</dd></div>`
  ).join('');
}

/** Варіанти для фільтра кольору — з самих даних, від найчастішого. */
function fillColors(list) {
  const counts = new Map();
  for (const c of list) {
    if (!c.exterior) continue;
    counts.set(c.exterior, (counts.get(c.exterior) || 0) + 1);
  }
  const sel = $('#f-color');
  const unknown = list.filter((c) => !c.exterior).length;
  sel.insertAdjacentHTML('beforeend', [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'))
    .map(([name, n]) => `<option value="${esc(name)}">${esc(name)} — ${n}</option>`)
    .join('') + (unknown ? `<option value="\u0000">колір невідомий — ${unknown}</option>` : ''));
}

/** Пневмо: білд-лист за VIN → інакше слова продавця → інакше невідомо (null).
    Ретрофіт нереальний, тому це властивість авто, а не опція, яку доберуть. */
function airState(c) {
  if (c.decoded) return !!c.keyFeatures?.air;
  if (typeof c.airSeller === 'boolean') return c.airSeller;
  return null;
}

function render() {
  const f = new FormData($('#controls'));
  const model = f.get('model');
  const year = f.get('year');
  const maxKm = Number(f.get('mileage')) || Infinity;
  const maxPrice = Number(f.get('price')) || Infinity;
  const onlyDecoded = f.get('decoded') === 'on';
  const onlyAir = f.get('air') === 'on';
  const color = f.get('color');

  let view = cars.filter((c) =>
    (!model || c.model.startsWith(model)) &&
    (!year || String(c.year) === year) &&
    c.mileageKm <= maxKm &&
    c.priceUSD <= maxPrice &&
    (!onlyDecoded || c.decoded) &&
    (!color || (color === '\u0000' ? !c.exterior : c.exterior === color)) &&
    // невідоме ховаємо разом із «немає»: краще недобрати кандидата, ніж
    // порахувати пневмо там, де її не перевіряли
    (!onlyAir || airState(c) === true)
  );

  const sorters = {
    'price': (a, b) => a.priceUSD - b.priceUSD,
    'price-desc': (a, b) => b.priceUSD - a.priceUSD,
    'mileage': (a, b) => a.mileageKm - b.mileageKm,
    'year-desc': (a, b) => b.year - a.year || a.priceUSD - b.priceUSD,
    'accident': (a, b) => (a.accident?.costKRW ?? 9e9) - (b.accident?.costKRW ?? 9e9) || a.priceUSD - b.priceUSD,
  };
  view = view.slice().sort(sorters[f.get('sort')] || sorters.price);

  $('#tally').innerHTML = view.length
    ? `Показано <b>${view.length}</b> з <b>${cars.length}</b>`
    : 'Під фільтри нічого не підходить';

  const cheapest = cars.reduce((a, c) => (c.priceUSD < a.priceUSD ? c : a), cars[0]);
  $('#ladder').innerHTML = view.map((c) => row(c, c === cheapest)).join('') ||
    '<li class="state">Послаб фільтри — під ці умови авто в списку немає.</li>';
}

function row(c, isCheapest) {
  const pos = Math.max(0, Math.min(1, (c.priceUSD - LADDER_FLOOR) / (BUDGET_CAP - LADDER_FLOOR)));
  const headroom = BUDGET_CAP - c.priceUSD;
  const href = `car.html?id=${encodeURIComponent(c.listingId)}`;
  const short = c.model.startsWith('X5') ? 'X5' : 'X6';

  const price = c.priceEstimated
    ? `<span class="est" title="Для X6 узято митну вартість X5 — реально очікувати на $1000–2000 більше">≈</span>${usd(c.priceUSD)}`
    : usd(c.priceUSD);

  // Салон: спершу білд-лист за VIN, інакше непідтверджене джерело (опис
  // оголошення чи фото) — тоді зі знаком питання.
  const trim = c.interior
    ? `салон <b>${esc(c.interior)}</b>`
    : (c.interiorUnverified
      ? `салон <b>${esc(c.interiorUnverified)}</b><span class="est" title="Не підтверджено білд-листом за VIN">?</span>`
      : '');
  const colors = c.exterior || trim
    ? `<p class="colors">${c.exterior
        ? `кузов ${swatch(c.exterior)}<b>${esc(c.exterior)}</b>`
        : ''}${c.exterior && trim ? ' · ' : ''}${trim}</p>`
    : '';

  return `<li class="car">
    <span class="car-rank num">${String(c.rank).padStart(2, '0')}</span>
    <div class="car-thumb">${thumb(c, href)}</div>
    <div class="car-id">
      <h2 class="car-title"><a href="${href}"><span class="model-tag">${short}</span>${c.year} · <span class="num">${km(c.mileageKm)}</span></a>${
        isCheapest ? '<span class="badge">найдешевше</span>' : ''}${
        c.mark ? `<span class="badge">${esc(MARKS[c.mark] || c.mark)}</span>` : ''}${
        (c.flags || []).map((f) => `<span class="badge badge-warn" title="Зі звіту інспекції">${esc(f)}</span>`).join('')}</h2>
      <p class="car-meta">${c.vin ? `VIN <span class="num">${esc(c.vin)}</span>` : 'VIN відсутній в Encar'} · лот <span class="num">${esc(c.listingId)}</span></p>
    </div>
    <p class="car-price"><span class="amount">${price}</span></p>
    <div class="car-scale">
      <div class="bar" role="img" aria-label="Ціна ${usd(c.priceUSD)}, запас до стелі ${usd(headroom)}">
        <span class="bar-fill" style="width:${(pos * 100).toFixed(1)}%"></span>
        <span class="bar-cap"></span>
      </div>
      <p class="bar-scale">запас <span class="num">${usd(headroom)}</span></p>
    </div>
    <p class="car-open"><a href="${encarUrl(c.listingId)}" rel="noopener noreferrer" target="_blank">Encar</a></p>
    <div class="car-spec">
      ${colors}
      ${accident(c)}
      ${c.decoded ? featureStrip(c) : pending(c)}
      ${c.note ? `<p class="colors">${esc(c.note)}</p>` : ''}
    </div>
  </li>`;
}

/** Недекодоване авто: комплектації немає, але пневмо часто відома з опису —
    а вона для нас важлива й нездобувна ретрофітом, тож показуємо окремо. */
function pending(c) {
  const air = airState(c);
  const note = air === null ? '' :
    ` · пневмопідвіска <b>${air ? 'є' : 'немає'}</b><span class="est" title="Зі слів продавця, не підтверджено білд-листом за VIN">?</span>`;
  return `<p class="feat-unknown">Комплектація — уточнюється за VIN${note}</p>`;
}

function thumb(c, href) {
  if (!c.photo) return '<span class="thumb-none">без фото</span>';
  const short = c.model.startsWith('X5') ? 'X5' : 'X6';
  return `<a href="${href}" tabindex="-1" aria-hidden="true"><img loading="lazy" decoding="async"
    src="${photoUrl(c.photo, 'thumb')}" alt="${short} ${c.year}, лот ${esc(c.listingId)}" width="280" height="158"></a>`;
}

function accident(c) {
  if (!c.accident) return '';
  const { costKRW, owners } = c.accident;
  const ow = `${owners} ${plural(owners, 'власник', 'власники', 'власників')}`;
  return costKRW
    ? `<p class="acc">ремонт ${krwM(costKRW)} · ${ow}</p>`
    : `<p class="acc"><span class="acc-clean">без ремонтів</span> · ${ow}</p>`;
}

function plural(n, one, few, many) {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

function featureStrip(c) {
  const kf = c.keyFeatures || {};
  const items = KEY_FEATURES.map((f) => {
    const { has, short, long } = featureState(kf, f);
    return `<li class="${has ? 'feat-yes' : 'feat-no'}" title="${esc(long)}">${has ? '✓ ' : ''}${esc(short)}</li>`;
  }).join('');
  return `<ul class="feats">${items}</ul>`;
}
