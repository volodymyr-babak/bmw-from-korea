import {
  man, manUSD, km, krwM, encarUrl, MARKS, initTheme, esc, genLabel,
} from './common.js';

const $ = (sel) => document.querySelector(sel);

let cars = [];
let meta = {};
let sort = { key: 'price', dir: 1 };

/** Ціна в Кореї — і колонка, і тай-брейк для всіх інших сортувань. */
const byPrice = (a, b) => a.koreaPriceMan - b.koreaPriceMan || a.listingId.localeCompare(b.listingId);

const COLUMNS = [
  { key: 'rank',      label: '№',        cls: 'c-rank num',  sort: byPrice,
    hint: 'Місце за ціною в Кореї' },
  { key: 'car',       label: 'Авто',     cls: 'c-car',       sort: (a, b) => a.year - b.year || (a.gen || 0) - (b.gen || 0),
    hint: 'Клік — сортувати за роком виготовлення' },
  { key: 'mileage',   label: 'Пробіг',   cls: 'c-num num',   sort: (a, b) => a.mileageKm - b.mileageKm },
  { key: 'price',     label: 'Ціна в Кореї', cls: 'c-price num', sort: byPrice,
    hint: 'Ціна в оголошенні Encar, у 만원 (1만원 = 10 000 ₩). Долари — довідка за курсом' },
  { key: 'incidents', label: 'ДТП',      cls: 'c-num num',   sort: (a, b) => (a.accident?.incidents ?? 9e9) - (b.accident?.incidents ?? 9e9),
    hint: 'Скільки РІЗНИХ ДТП, а не страхових записів. Encar показує «cases» — '
        + 'але одне ДТП дає два записи, якщо платили і власнику, і потерпілій '
        + 'стороні. Рахуємо унікальні дати; «—» — детальних записів немає' },
  { key: 'accident',  label: 'Ремонт',   cls: 'c-num num',   sort: (a, b) => (a.accident?.costKRW ?? 9e9) - (b.accident?.costKRW ?? 9e9),
    hint: 'Виплати страховика за власний ремонт цього авто' },
  { key: 'owners',    label: 'Змін вл.', cls: 'c-num num',   sort: (a, b) => (a.accident?.owners ?? 9e9) - (b.accident?.owners ?? 9e9),
    hint: 'Скільки разів змінювався власник (Encar ownerChangeCnt). '
        + '0 — авто досі на першому власнику, дилер продає за дорученням' },
  { key: 'note',      label: 'Нотатка',  cls: 'c-note',      sort: byText((c) => c.note) },
];

/** Порожнє значення завжди в кінець, у який бік не сортуй. */
function byText(get) {
  return (a, b) => {
    const x = get(a) || '', y = get(b) || '';
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
    return x.localeCompare(y, 'uk');
  };
}

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
  fillYears(cars);
  renderHead();
  $('#controls').addEventListener('change', render);
  $('#state').hidden = true;
  $('#sec').hidden = false;
  render();
}

function renderFigures(meta, list) {
  const cheapest = Math.min(...list.map((c) => c.koreaPriceMan));
  const withInc = list.filter((c) => c.accident?.incidents != null);
  const clean = withInc.filter((c) => c.accident.incidents === 0).length;
  const noRepair = list.filter((c) => !c.accident?.costKRW).length;
  const updated = new Date(meta.updated).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#figures').innerHTML = [
    ['Кандидатів у списку', `${list.length}`, true],
    ['Найдешевше в Кореї', `${man(cheapest)} · ${manUSD(cheapest)}`, true],
    ['Без жодного ДТП', `${clean} з ${withInc.length}`, true],
    ['Без виплат за ремонт', `${noRepair} з ${list.length}`, true],
    ['Дані станом на', updated, false],
  ].map(([dt, dd, isNum]) =>
    `<div><dt>${esc(dt)}</dt><dd${isNum ? ' class="num"' : ''}>${esc(dd)}</dd></div>`
  ).join('');
}

/** Роки — з даних, щоб список не хардкодити: він росте з кожним новим модельним роком. */
function fillYears(list) {
  const years = [...new Set(list.map((c) => c.year))].sort();
  $('#f-year').insertAdjacentHTML('beforeend',
    years.map((y) => `<option value="${y}">${y}</option>`).join(''));
}

/* ---- таблиця ---- */

function renderHead() {
  const table = $('#grid');
  table.innerHTML = `
    <colgroup>${COLUMNS.map((c) => `<col class="${c.cls.split(' ')[0]}">`).join('')}</colgroup>
    <thead><tr>${COLUMNS.map((c) => `<th class="${c.cls}" data-key="${c.key}" scope="col"
      ${c.hint ? `title="${esc(c.hint)}"` : ''}><button type="button">${esc(c.label)}</button></th>`).join('')}</tr></thead>
    <tbody></tbody>`;

  table.tHead.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const key = th.dataset.key;
    sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: 1 };
    render();
  });

  // Підсвітка колонки під курсором.
  table.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('td, th');
    const list = table.querySelectorAll('col');
    list.forEach((col) => col.classList.remove('hl'));
    if (cell && list[cell.cellIndex]) list[cell.cellIndex].classList.add('hl');
  });
  table.addEventListener('mouseleave', () => {
    table.querySelectorAll('col').forEach((col) => col.classList.remove('hl'));
  });
}

function render() {
  const f = new FormData($('#controls'));
  const gen = f.get('gen');
  const year = f.get('year');
  const maxInc = f.get('incidents') === '' ? null : Number(f.get('incidents'));
  const repair = f.get('repair');

  let view = cars.filter((c) =>
    (!gen || String(c.gen) === gen) &&
    (!year || String(c.year) === year) &&
    // Невідоме ховаємо разом із «забагато»: краще недобрати кандидата, ніж
    // показати як чисте авто, ДТП якого ми просто не рахували.
    (maxInc === null || (c.accident?.incidents != null && c.accident.incidents <= maxInc)) &&
    (!repair || (repair === 'no'
      ? !(c.accident?.costKRW)
      : !!(c.accident?.costKRW)))
  );

  const col = COLUMNS.find((c) => c.key === sort.key);
  const cmp = col ? col.sort : byPrice;
  view = view.slice().sort((a, b) => cmp(a, b) * sort.dir || byPrice(a, b));

  document.querySelectorAll('.grid thead th').forEach((th) => {
    th.setAttribute('aria-sort', th.dataset.key === sort.key
      ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  });

  $('#tally').innerHTML = view.length
    ? `Показано <b>${view.length}</b> з <b>${cars.length}</b>`
    : 'Під фільтри нічого не підходить';

  const cheapest = cars.reduce((a, c) => (c.koreaPriceMan < a.koreaPriceMan ? c : a), cars[0]);
  $('#count').textContent = view.length === cars.length ? `${cars.length}` : `${view.length} з ${cars.length}`;
  $('#grid tbody').innerHTML = view.map((c) => row(c, c === cheapest)).join('') ||
    `<tr><td class="empty" colspan="${COLUMNS.length}">Під ці фільтри нічого немає.</td></tr>`;
}

function row(c, isCheapest) {
  const href = `car.html?id=${encodeURIComponent(c.listingId)}`;

  const badges = [
    isCheapest ? '<span class="badge">найдешевше</span>' : '',
    c.mark ? `<span class="badge">${esc(MARKS[c.mark] || c.mark)}</span>` : '',
    ...(c.flags || []).map((x) => `<span class="badge badge-warn" title="Зі звіту інспекції">${esc(x)}</span>`),
  ].join('');

  return `<tr>
    <td class="c-rank num">${String(c.rank).padStart(2, '0')}</td>
    <th class="c-car" scope="row">
      <a class="car-link" href="${href}"><span class="model-tag">${esc(genLabel(c.gen))}</span>${c.year}</a>${badges}
      <span class="c-car-meta">лот <span class="num">${esc(c.listingId)}</span> ·
        <a href="${encarUrl(c.listingId)}" rel="noopener noreferrer" target="_blank">Encar&nbsp;↗</a>
        ${c.vin ? `<br>VIN <span class="num">${esc(c.vin)}</span>` : '<br>VIN відсутній в Encar'}</span>
    </th>
    <td class="c-num num">${km(c.mileageKm)}</td>
    <td class="c-price num"><span class="amount">${man(c.koreaPriceMan)}</span>
      <span class="amount-usd">${manUSD(c.koreaPriceMan)}</span></td>
    <td class="c-num num">${c.accident?.incidents == null
      ? '—'
      : (c.accident.incidents || '<span class="acc-clean">нема</span>')}</td>
    <td class="c-num num">${c.accident?.costKRW
      ? krwM(c.accident.costKRW)
      : '<span class="acc-clean">нема</span>'}</td>
    <td class="c-num num">${c.accident ? c.accident.owners : '—'}</td>
    <td class="c-note">${c.note ? esc(c.note) : ''}</td>
  </tr>`;
}
