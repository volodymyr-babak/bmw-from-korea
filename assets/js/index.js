import { usd, km, KEY_FEATURES, featureState, encarUrl, MARKS, initTheme, esc, BUDGET_CAP, LADDER_FLOOR } from './common.js';

const $ = (sel) => document.querySelector(sel);

let cars = [];

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
  renderFigures(data.meta, cars);
  $('#controls').addEventListener('change', render);
  $('#state').hidden = true;
  $('#ladder').hidden = false;
  render();
}

function renderFigures(meta, list) {
  const cheapest = Math.min(...list.map((c) => c.priceUSD));
  const decoded = list.filter((c) => c.decoded).length;
  const updated = new Date(meta.updated).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#figures').innerHTML = [
    ['Кандидатів у списку', list.length, true],
    ['Найдешевше під ключ', usd(cheapest), true],
    ['Стеля бюджету', usd(BUDGET_CAP), true],
    ['Комплектація за VIN', `${decoded} з ${list.length}`, true],
    ['Дані станом на', updated, false],
  ].map(([dt, dd, isNum]) =>
    `<div><dt>${esc(dt)}</dt><dd${isNum ? ' class="num"' : ''}>${esc(dd)}</dd></div>`
  ).join('');
}

function render() {
  const f = new FormData($('#controls'));
  const year = f.get('year');
  const maxKm = Number(f.get('mileage')) || Infinity;
  const maxPrice = Number(f.get('price')) || Infinity;
  const onlyDecoded = f.get('decoded') === 'on';

  let view = cars.filter((c) =>
    (!year || String(c.year) === year) &&
    c.mileageKm <= maxKm &&
    c.priceUSD <= maxPrice &&
    (!onlyDecoded || c.decoded)
  );

  const sorters = {
    'price': (a, b) => a.priceUSD - b.priceUSD,
    'price-desc': (a, b) => b.priceUSD - a.priceUSD,
    'mileage': (a, b) => a.mileageKm - b.mileageKm,
    'year-desc': (a, b) => b.year - a.year || a.priceUSD - b.priceUSD,
  };
  view = view.slice().sort(sorters[f.get('sort')] || sorters.price);

  $('#tally').innerHTML = view.length
    ? `Показано <b>${view.length}</b> з <b>${cars.length}</b>`
    : 'Під фільтри нічого не підходить';

  $('#ladder').innerHTML = view.map(row).join('') ||
    '<li class="state">Послаб фільтри — під ці умови авто в списку немає.</li>';
}

function row(c) {
  const pos = Math.max(0, Math.min(1, (c.priceUSD - LADDER_FLOOR) / (BUDGET_CAP - LADDER_FLOOR)));
  const badge = c.mark ? `<span class="badge">${esc(MARKS[c.mark] || c.mark)}</span>` : '';
  const headroom = BUDGET_CAP - c.priceUSD;

  const colors = c.exterior || c.interior
    ? `<p class="colors">${c.exterior ? `кузов <b>${esc(c.exterior)}</b>` : ''}${c.exterior && c.interior ? ' · ' : ''}${c.interior ? `салон <b>${esc(c.interior)}</b>` : ''}</p>`
    : '';

  const feats = c.decoded
    ? ''
    : '<p class="feat-unknown">Комплектація — уточнюється за VIN</p>';

  return `<li class="car">
    <span class="car-rank num">${String(c.rank).padStart(2, '0')}</span>
    <div class="car-id">
      <h2 class="car-title"><a href="car.html?id=${encodeURIComponent(c.listingId)}">${c.year} · <span class="num">${km(c.mileageKm)}</span></a>${badge}</h2>
      <p class="car-meta">${c.vin ? `VIN <span class="num">${esc(c.vin)}</span>` : 'VIN відсутній в Encar'} · лот <span class="num">${esc(c.listingId)}</span></p>
    </div>
    <p class="car-price"><span class="amount">${usd(c.priceUSD)}</span></p>
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
      ${c.decoded ? featureStrip(c) : feats}
      ${c.note ? `<p class="colors">${esc(c.note)}</p>` : ''}
    </div>
  </li>`;
}

function featureStrip(c) {
  const kf = c.keyFeatures || {};
  const items = KEY_FEATURES.map((f) => {
    const { has, short, long } = featureState(kf, f);
    return `<li class="${has ? 'feat-yes' : 'feat-no'}" title="${esc(long)}">${has ? '\u2713\u00a0' : ''}${esc(short)}</li>`;
  }).join('');
  return `<ul class="feats">${items}</ul>`;
}
