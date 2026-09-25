import {
  man, manUSD, km, krwM, KEY_FEATURES, featureState, encarUrl, MARKS,
  initTheme, esc, swatch,
} from './common.js';
import { trimStrip, trimShort, trimName } from './trims.js';

const $ = (sel) => document.querySelector(sel);

/** Секції на головній. З 2026-09-25 — лише X6; X5 повертається дописуванням сюди
 *  і секції `sec-X5` в index.html. */
const MODELS = ['X6'];

let cars = [];
let meta = {};
let sort = { key: 'price', dir: 1 };
let cols = [];

/** Колонки опцій — короткий заголовок у шапці, повна назва в title.
 *  Порядок і склад беремо з KEY_FEATURES, щоб таблиця й сторінка авто
 *  ніколи не розійшлися. */
const FEATURE_HEAD = {
  air: 'пнв', light: 'світ', acc: 'ACC', park: '360', soft: 's-cl',
  comfort: 'ключ', vent: 'вент', seatheat: 'сид', wheelheat: 'крм',
  climate4: '4-зн', audio: 'ауд', roof: 'дах', exhaust: 'вихл',
};

/** 48V у колонці був би ще однією галочкою; він важливіший за галочку —
 *  це інший двигун (210 кВт / 286 к.с. проти 195/265), тож стоїть міткою
 *  прямо біля року. У KEY_FEATURES слот лишається: сторінка авто його показує. */
const FEATURE_COLUMNS = KEY_FEATURES.filter((f) => f.id !== 'mhev');

/** Слоти, де вищий тир позначаємо плюсом: лазер понад LED, B&W понад H/K,
 *  Sky Lounge понад звичайну панораму. */
const TOP_TIER = { light: 'лазер', audio: 'B&W', roof: 'Sky Lounge' };

/** Ціна в Кореї — і колонка, і тай-брейк для всіх інших сортувань. */
const byPrice = (a, b) => a.koreaPriceMan - b.koreaPriceMan;

const COLUMNS = [
  { key: 'rank',      label: '№',        cls: 'c-rank num',  sort: byPrice,
    hint: 'Місце за ціною в Кореї серед своєї моделі' },
  { key: 'car',       label: 'Авто',     cls: 'c-car',       sort: (a, b) => a.model.localeCompare(b.model, 'uk') || a.year - b.year,
    hint: 'Клік — сортувати за моделлю й роком' },
  { key: 'mileage',   label: 'Пробіг',   cls: 'c-num num',   sort: (a, b) => a.mileageKm - b.mileageKm },
  { key: 'price',     label: 'Ціна в Кореї', cls: 'c-price num', sort: byPrice,
    hint: 'Ціна в оголошенні Encar, у 만원 (1만원 = 10 000 ₩). Долари — довідка за курсом' },
  { key: 'exterior',  label: 'Кузов',    cls: 'c-color',     sort: byText((c) => c.exterior) },
  { key: 'interior',  label: 'Салон',    cls: 'c-color',     sort: byText((c) => c.interior || c.interiorUnverified) },
  { key: 'finish',    label: 'Планки',   cls: 'c-finish',    sort: byText((c) => trimName(c.trimFinish)),
    hint: 'Декоративні вставки салону (Interior trim finishers) — алюміній, дерево, '
        + 'рояльний лак. У білд-листі вона рівно одна; на фото оголошення її '
        + 'майже не спіймати, тому «—» означає, що VIN ще немає' },
  { key: 'incidents', label: 'ДТП',      cls: 'c-num num',   sort: (a, b) => (a.accident?.incidents ?? 9e9) - (b.accident?.incidents ?? 9e9),
    hint: 'Скільки РІЗНИХ ДТП, а не страхових записів. Encar показує «cases» — '
        + 'але одне ДТП дає два записи, якщо платили і власнику, і потерпілій '
        + 'стороні. Рахуємо унікальні дати; «—» — детальних записів немає' },
  { key: 'accident',  label: 'Ремонт',   cls: 'c-num num',   sort: (a, b) => (a.accident?.costKRW ?? 9e9) - (b.accident?.costKRW ?? 9e9),
    hint: 'Виплати страховика за власний ремонт' },
  { key: 'owners',    label: 'Змін вл.', cls: 'c-num num',   sort: (a, b) => (a.accident?.owners ?? 9e9) - (b.accident?.owners ?? 9e9),
    hint: 'Скільки разів змінювався власник (Encar ownerChangeCnt). '
        + '0 — авто досі на першому власнику, дилер продає за дорученням' },
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
  // Своя нумерація в кожній таблиці: «№» = місце за ціною СЕРЕД СВОЄЇ МОДЕЛІ.
  // Глобальний `rank` тут дав би діри (1, 3, 4, 8…) і виглядав би як помилка.
  for (const m of MODELS) {
    cars.filter((c) => c.model.startsWith(m))
      .sort(byPrice)
      .forEach((c, i) => { c.rankModel = i + 1; });
  }
  renderFigures(meta, cars);
  fillColors(cars);
  fillTrims(cars);
  renderHead();
  $('#controls').addEventListener('change', render);
  $('#state').hidden = true;
  MODELS.forEach((m) => { $(`#sec-${m}`).hidden = false; });
  render();
}

function renderFigures(meta, list) {
  const cheapest = Math.min(...list.map((c) => c.koreaPriceMan));
  const decoded = list.filter((c) => c.decoded).length;
  // Пневмо тут більше не показуємо: з 03.09 це критерій добірки, тож у
  // декодованих вона є завжди, і рядок «21 з 21» нічого не додавав.
  // Натомість — скільки авто взагалі без ДТП, це справді різнить кандидатів.
  const withInc = list.filter((c) => c.accident?.incidents != null);
  const clean = withInc.filter((c) => c.accident.incidents === 0).length;
  const updated = new Date(meta.updated).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#figures').innerHTML = [
    ['Кандидатів у списку', `${list.length}`, true],
    ['Найдешевше в Кореї', `${man(cheapest)} · ${manUSD(cheapest)}`, true],
    ['Комплектація за VIN', `${decoded} з ${list.length}`, true],
    ['Без жодного ДТП', `${clean} з ${withInc.length}`, true],
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
    .join('') + (unknown ? `<option value=" ">колір невідомий — ${unknown}</option>` : ''));
}

/** Салон для показу й фільтра: білд-лист за VIN → інакше непідтверджене
 *  джерело (опис чи фото). null — про салон не відомо нічого. */
function trimLabel(c) {
  return c.interior || c.interiorUnverified || null;
}

/** Варіанти для фільтра салону — з даних, підтверджені за VIN спершу. */
function fillTrims(list) {
  const counts = new Map();
  for (const c of list) {
    const t = trimLabel(c);
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const unknown = list.filter((c) => !trimLabel(c)).length;
  const verified = (name) => list.some((c) => c.interior === name);
  $('#f-trim').insertAdjacentHTML('beforeend', [...counts.entries()]
    .sort((a, b) => Number(verified(b[0])) - Number(verified(a[0])) || b[1] - a[1])
    .map(([name, n]) =>
      `<option value="${esc(name)}">${esc(name)}${verified(name) ? '' : ' (?)'} — ${n}</option>`)
    .join('') + (unknown ? `<option value=" ">салон невідомий — ${unknown}</option>` : ''));
}

/** Пневмо: білд-лист за VIN → інакше слова продавця → інакше невідомо (null).
    Ретрофіт нереальний, тому це властивість авто, а не опція, яку доберуть. */
function airState(c) {
  if (c.decoded) return !!c.keyFeatures?.air;
  if (typeof c.airSeller === 'boolean') return c.airSeller;
  return null;
}

/* ---- таблиця ---- */

function renderHead() {
  cols = [
    ...COLUMNS.map((c) => ({ ...c, group: '' })),
    ...FEATURE_COLUMNS.map((f) => ({
      key: `f:${f.id}`,
      label: FEATURE_HEAD[f.id] || f.short,
      cls: 'c-feat',
      hint: f.long,
      sort: (a, b) => featRank(b, f) - featRank(a, f),
    })),
    { key: 'note', label: 'Нотатка', cls: 'c-note', sort: byText((c) => c.note) },
  ];
  // Дві окремі таблиці — X5, потім X6. Сортування спільне: клік по будь-якому
  // заголовку перебудовує обидві, щоб порівняння між моделями лишалось чесним.
  for (const m of MODELS) {
    const table = $(`#grid-${m}`);
    table.innerHTML = `
      <colgroup>${cols.map((c) => `<col class="${c.cls.split(' ')[0]}">`).join('')}</colgroup>
      <thead><tr>${cols.map((c) => `<th class="${c.cls}" data-key="${c.key}" scope="col"
        ${c.hint ? `title="${esc(c.hint)}"` : ''}><button type="button">${esc(c.label)}</button></th>`).join('')}</tr></thead>
      <tbody></tbody>`;

    table.tHead.addEventListener('click', (e) => {
      const th = e.target.closest('th');
      if (!th) return;
      const key = th.dataset.key;
      sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: 1 };
      render();
    });

    // Підсвітка колонки під курсором: у широкій таблиці без неї легко зʼїхати оком.
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
}

/** Порядок сортування для колонки опції: є (2) → немає (1) → не перевірено (0) */
function featRank(c, f) {
  if (!c.decoded) {
    if (f.id !== 'air') return 0;
    const air = airState(c);
    return air === null ? 0 : (air ? 2 : 1);
  }
  return featureState(c.keyFeatures || {}, f).has ? 2 : 1;
}

function render() {
  const f = new FormData($('#controls'));
  const model = f.get('model');
  const year = f.get('year');
  const maxInc = f.get('incidents') === '' ? null : Number(f.get('incidents'));
  const repair = f.get('repair');
  const color = f.get('color');
  const trimColor = f.get('trim');

  let view = cars.filter((c) =>
    (!model || c.model.startsWith(model)) &&
    (!year || String(c.year) === year) &&
    (!color || (color === ' ' ? !c.exterior : c.exterior === color)) &&
    (!trimColor || (trimColor === ' ' ? !trimLabel(c) : trimLabel(c) === trimColor)) &&
    // Невідоме ховаємо разом із «забагато»: краще недобрати кандидата, ніж
    // показати як чисте авто, ДТП якого ми просто не рахували.
    (maxInc === null || (c.accident?.incidents != null && c.accident.incidents <= maxInc)) &&
    (!repair || (repair === 'no'
      ? !(c.accident?.costKRW)
      : !!(c.accident?.costKRW)))
  );

  const col = cols.find((c) => c.key === sort.key);
  const cmp = col ? col.sort : byPrice;
  view = view.slice().sort((a, b) => cmp(a, b) * sort.dir || byPrice(a, b));

  document.querySelectorAll('.grid thead th').forEach((th) => {
    th.setAttribute('aria-sort', th.dataset.key === sort.key
      ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  });

  $('#tally').innerHTML = view.length
    ? `Показано <b>${view.length}</b> з <b>${cars.length}</b>`
    : 'Під фільтри нічого не підходить';

  // «Найдешевше» рахуємо по всьому списку, а не в межах моделі: мітка має
  // означати найдешевше авто взагалі, інакше їх було б дві.
  const cheapest = cars.reduce((a, c) => (c.koreaPriceMan < a.koreaPriceMan ? c : a), cars[0]);
  const width = cols.length;
  for (const m of MODELS) {
    const part = view.filter((c) => c.model.startsWith(m));
    const all = cars.filter((c) => c.model.startsWith(m)).length;
    // Секцію ховаємо тільки тоді, коли моделі немає в списку взагалі. Якщо її
    // сховали фільтри — показуємо порожню таблицю з поясненням, інакше зникнення
    // цілого блока читалось би як «таких авто не буває».
    $(`#sec-${m}`).hidden = all === 0;
    $(`#count-${m}`).textContent = part.length === all
      ? `${all}`
      : `${part.length} з ${all}`;
    $(`#grid-${m} tbody`).innerHTML = part.map((c) => row(c, c === cheapest)).join('') ||
      `<tr><td class="empty" colspan="${width}">Під ці фільтри ${m} немає.</td></tr>`;
  }
}

function row(c, isCheapest) {
  const href = `car.html?id=${encodeURIComponent(c.listingId)}`;
  const short = c.model.startsWith('X5') ? 'X5' : 'X6';

  const badges = [
    isCheapest ? '<span class="badge">найдешевше</span>' : '',
    c.mark ? `<span class="badge">${esc(MARKS[c.mark] || c.mark)}</span>` : '',
    ...(c.flags || []).map((x) => `<span class="badge badge-warn" title="Зі звіту інспекції">${esc(x)}</span>`),
  ].join('');

  return `<tr>
    <td class="c-rank num">${String(c.rankModel ?? c.rank).padStart(2, '0')}</td>
    <th class="c-car" scope="row">
      <a class="car-link" href="${href}"><span class="model-tag">${short} ${esc(c.engine || '30d')}</span>${c.year}</a>${
        mhevTag(c)}${badges}
      <span class="c-car-meta">лот <span class="num">${esc(c.listingId)}</span> ·
        <a href="${encarUrl(c.listingId)}" rel="noopener noreferrer" target="_blank">Encar&nbsp;↗</a>
        ${c.vin ? `<br>VIN <span class="num">${esc(c.vin)}</span>` : '<br>VIN відсутній в Encar'}</span>
    </th>
    <td class="c-num num">${km(c.mileageKm)}</td>
    <td class="c-price num"><span class="amount">${man(c.koreaPriceMan)}</span>
      <span class="amount-usd">${manUSD(c.koreaPriceMan)}</span></td>
    <td class="c-color">${colorCell(c.exterior, 'paint')}</td>
    <td class="c-color">${colorCell(trimLabel(c), 'trim', !c.interior)}</td>
    <td class="c-finish">${finishCell(c)}</td>
    <td class="c-num num">${c.accident?.incidents == null
      ? '—'
      : (c.accident.incidents || '<span class="acc-clean">нема</span>')}</td>
    <td class="c-num num">${c.accident?.costKRW
      ? krwM(c.accident.costKRW)
      : '<span class="acc-clean">нема</span>'}</td>
    <td class="c-num num">${c.accident ? c.accident.owners : '—'}</td>
    ${FEATURE_COLUMNS.map((f) => featCell(c, f)).join('')}
    <td class="c-note">${c.note ? esc(c.note) : ''}</td>
  </tr>`;
}

/** 48V біля року: «48V» — є за білд-листом, «?» — VIN ще немає і ми не знаємо,
 *  порожньо — за білд-листом його немає. Обидві мітки зелені, як просив користувач. */
function mhevTag(c) {
  if (!c.decoded) {
    return '<span class="tag-mhev" title="48V mild-hybrid — невідомо, білд-листа за VIN ще немає">?</span>';
  }
  return c.keyFeatures?.mhev
    ? '<span class="tag-mhev" title="48V mild-hybrid (S1CE): у 30d — 210 кВт / 286 к.с. проти 195 / 265 без нього; у 40d — 250 кВт / 340 к.с.">48V</span>'
    : '';
}

/** Планка салону: смужка з мотивом + коротка назва. Без білд-листа — «—»,
 *  той самий третій стан, що й у колонках опцій: «не перевірено», а не «немає». */
function finishCell(c) {
  if (!c.trimFinish) {
    return '<span class="cell-unknown" title="Не перевірено — білд-листа за VIN немає">—</span>';
  }
  return `<span class="finish-cell" title="${esc(trimName(c.trimFinish))} · ${esc(c.trimFinish.code)}">${
    trimStrip(c.trimFinish, { h: 12, cls: 'tstrip-cell' })}<span>${esc(trimShort(c.trimFinish))}</span></span>`;
}

function colorCell(name, kind, unverified = false) {
  if (!name) return '<span class="cell-unknown" title="Невідомо">—</span>';
  return `${swatch(name, kind)}${esc(name)}${unverified
    ? '<span class="est" title="Не підтверджено білд-листом за VIN">?</span>' : ''}`;
}

/** Три стани, і третій обовʼязковий: порожній чекбокс означав би «опції немає»,
 *  а в недекодованих авто ми просто не знаємо. Пневмо — виняток: її часто
 *  видно з опису оголошення, тоді показуємо зі знаком питання. */
function featCell(c, f) {
  if (!c.decoded) {
    if (f.id === 'air') {
      const air = airState(c);
      if (air !== null) {
        return `<td class="c-feat ${air ? 'cell-yes' : 'cell-no'}"
          title="${air ? 'Пневмопідвіска є' : 'Пневмопідвіски немає'} — зі слів продавця, не підтверджено за VIN">${
          air ? '✔' : '☐'}<span class="est">?</span></td>`;
      }
    }
    return '<td class="c-feat cell-unknown" title="Не перевірено — білд-листа за VIN немає">—</td>';
  }
  const { has, short, long } = featureState(c.keyFeatures || {}, f);
  const top = has && TOP_TIER[f.id] && short === TOP_TIER[f.id];
  return `<td class="c-feat ${has ? 'cell-yes' : 'cell-no'}" title="${esc(long)}">${
    has ? (top ? '✔<sup>+</sup>' : '✔') : '☐'}</td>`;
}
