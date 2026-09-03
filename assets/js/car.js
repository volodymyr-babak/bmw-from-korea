import {
  usd, km, krw, krwM, breakdown, KEY_FEATURES, featureState, encarUrl, MARKS, photoUrl,
  initTheme, esc, swatch, KRW_PER_USD, AGE_BASE, BUDGET_CAP,
} from './common.js';
import { groupOptions } from './options.js';
import { trimStrip, trimSpec, trimName } from './trims.js';

const $ = (sel) => document.querySelector(sel);
const id = new URLSearchParams(location.search).get('id');

init();

async function init() {
  initTheme();
  if (!id || !/^\d+$/.test(id)) {
    fail('Немає номера лота в адресі. Вибери авто у <a href="index.html">шортлисті</a>.');
    return;
  }

  let index;
  try {
    index = await (await fetch('data/cars.json', { cache: 'no-cache' })).json();
  } catch (e) {
    fail('Не вдалося завантажити список авто.');
    return;
  }

  const summary = index.cars.find((c) => c.listingId === id);
  if (!summary) {
    fail(`Лота <span class="num">${esc(id)}</span> немає в шортлисті. Відкрий <a href="index.html">повний список</a>.`);
    return;
  }

  // детальний файл є в кожного авто: фото, історія, корейська ціна;
  // у декодованих там ще й повний білд-лист
  let detail = null;
  try {
    const res = await fetch(`data/cars/${id}.json`, { cache: 'no-cache' });
    if (res.ok) detail = await res.json();
  } catch (e) { /* показуємо те, що є в індексі */ }

  const short = summary.model.startsWith('X5') ? 'X5' : 'X6';
  document.title = `${summary.year} ${short} xDrive30d · ${usd(summary.priceUSD)} під ключ — X5 і X6 з Кореї`;
  renderHead(summary, detail, index.meta);
  renderBody(summary, detail);
  wireGallery(summary, detail);
  $('#state').hidden = true;
  $('#body').hidden = false;
}

function fail(html) {
  $('#state').innerHTML = html;
}

function renderHead(c, d, meta) {
  const badge = c.mark ? `<span class="badge">${esc(MARKS[c.mark] || c.mark)}</span>` : '';
  const headroom = BUDGET_CAP - c.priceUSD;
  const price = c.priceEstimated
    ? `<span class="est">≈</span>${usd(c.priceUSD)}`
    : usd(c.priceUSD);
  const est = c.priceEstimated
    ? ' · оцінка: митну вартість узято з таблиці X5, чекаємо на $1000–2000 більше'
    : '';
  $('#head').innerHTML = `
    <h1 class="detail-title">BMW ${esc(c.model)} xDrive30d M Sport<br>${c.year} року, <span class="num">${km(c.mileageKm)}</span>${badge}</h1>
    <p class="detail-price">
      <span class="amount">${price}</span>
      <span class="amount-note">під ключ у Києві · до стелі бюджету лишається ${usd(headroom)}${est}</span>
    </p>
    <p class="detail-actions">
      <a class="btn" href="${encarUrl(c.listingId)}" rel="noopener noreferrer" target="_blank">Відкрити оголошення на Encar</a>
      <a class="btn btn-quiet" href="index.html">Усі ${meta.count} кандидатів</a>
    </p>`;
}

function renderBody(c, d) {
  const b = breakdown(c.year, c.priceUSD, c.koreaPriceMan);
  $('#body').innerHTML = `
    ${gallery(c, d)}
    ${panelRenders(c, d)}
    <div class="panels">
      <div class="panel-col">${panelIdentity(c, d)}${panelCalc(c, b)}</div>
      <div class="panel-col">${panelFeatures(c, d)}${panelHistory(d)}</div>
    </div>
    ${panelInspection(c, d)}
    ${panelSeller(c, d)}
    ${panelOptions(c, d)}`;
}

/** Рендери заводської конфігурації за VIN — еталон кольору кузова й салону.
 *  Саме вони знімають питання «кава чи cognac», якого не бере ні фото з
 *  оголошення, ні метрика відтінку. Джерело — API bimmer.work. */
function panelRenders(c, d) {
  const r = (d && d.renders) || null;
  if (!r || (!r.exterior && !r.interior)) return '';
  const shots = [
    [r.exterior, 'Кузов', d.exterior && d.exterior.name],
    [r.interior, 'Салон', d.interior && d.interior.name],
  ].filter(([src]) => src);
  return `<section class="panel panel-wide"><h2>Заводська конфігурація за VIN</h2>
    <div class="renders">${shots.map(([src, kind, name]) => `<figure>
      <img loading="lazy" decoding="async" src="${esc(src)}" width="1000" height="600"
        alt="${esc(kind)} — заводський рендер за VIN ${esc(c.vin || '')}">
      <figcaption>${esc(kind)}${name ? ` · <b>${esc(name)}</b>` : ''}</figcaption>
    </figure>`).join('')}</div>
    <p class="note">Рендер BMW за VIN, не фото цього авто: показує саме ту фарбу
      й оббивку, які стоять у білд-листі. Пробіг, стан і доукомплектацію дивитись
      на фото з оголошення вище.</p>
  </section>`;
}

/** Фото з оголошення: велике + смужка мініатюр (кузов, потім салон) */
function gallery(c, d) {
  const ph = (d && d.photos) || {};
  const shots = [
    ...(ph.outer || []).map((p) => ({ path: p, kind: 'кузов' })),
    ...(ph.inner || []).map((p) => ({ path: p, kind: 'салон' })),
  ];
  if (!shots.length) return '';
  const short = c.model.startsWith('X5') ? 'X5' : 'X6';
  const alt = `${short} ${c.year}, лот ${c.listingId}`;
  const strip = shots.map((s, i) => `<li><button type="button" data-i="${i}"
      aria-current="${i === 0}" aria-label="Фото ${i + 1} — ${s.kind}"><img loading="lazy" decoding="async"
      src="${photoUrl(s.path, 'thumb')}" alt="" width="280" height="158"></button></li>`).join('');
  return `<section class="gallery" aria-label="Фото з оголошення">
    <figure class="shot"><img id="shot" src="${photoUrl(shots[0].path, 'large')}"
      alt="${esc(alt)}" width="800" height="450" decoding="async"></figure>
    <ul class="strip">${strip}</ul>
    <p class="shot-caption" id="shot-caption">Фото 1 з ${shots.length} — кузов · з оголошення на Encar</p>
  </section>`;
}

function wireGallery(c, d) {
  const strip = $('.strip');
  if (!strip) return;
  const ph = (d && d.photos) || {};
  const shots = [
    ...(ph.outer || []).map((p) => ({ path: p, kind: 'кузов' })),
    ...(ph.inner || []).map((p) => ({ path: p, kind: 'салон' })),
  ];
  strip.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-i]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    $('#shot').src = photoUrl(shots[i].path, 'large');
    $('#shot-caption').textContent = `Фото ${i + 1} з ${shots.length} — ${shots[i].kind} · з оголошення на Encar`;
    strip.querySelectorAll('button[data-i]').forEach((b) =>
      b.setAttribute('aria-current', String(b === btn)));
  });
}

function rows(pairs) {
  return `<dl class="rows">${pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`)
    .join('')}</dl>`;
}

function colorLine(side, kind = null) {
  if (!side || !side.name) return null;
  const bits = [`${kind ? swatch(side, kind) : ''}<b>${esc(side.name)}</b>`];
  if (side.code) bits.push(`<span class="num">${esc(side.code)}</span>`);
  if (side.german) bits.push(`<span class="opt-en">${esc(side.german)}</span>`);
  return bits.join(' · ');
}

function panelIdentity(c, d) {
  const pairs = [
    ['VIN', c.vin ? `<span class="num">${esc(c.vin)}</span>` : 'відсутній в Encar'],
    ['Лот на Encar', `<span class="num">${esc(c.listingId)}</span>`],
    ['Рік виготовлення', `<span class="num">${c.year}</span>`],
    ['Пробіг', `<span class="num">${km(c.mileageKm)}</span>`],
  ];
  if (d) {
    if (d.prodDate) pairs.push(['Дата випуску', `<span class="num">${esc(d.prodDate)}</span>`]);
    if (d.modelYear) pairs.push(['Модельний рік', `<span class="num">${d.modelYear}</span>`]);
    if (d.engine) pairs.push(['Двигун', `<span class="num">${esc(d.engine)}</span>${d.power ? ` · ${esc(d.power)}` : ''}`]);
  }
  // назви BMW беремо з білд-листа; поки його немає — корейський колір з оголошення
  pairs.push(['Колір кузова', colorLine(d && d.exterior, 'paint')
    || (c.exterior ? `${swatch(c.exterior)}<b>${esc(c.exterior)}</b>` : null)]);
  // Пріоритет: білд-лист за VIN → колір з індексу → опис продавця (він збігається
  // з VIN там, де є обидва, але це все ж слова продавця, тому позначаємо).
  pairs.push(['Салон', colorLine(d && d.interior, 'trim')
    || (c.interior ? `${swatch(c.interior, 'trim')}<b>${esc(c.interior)}</b>` : null)
    || (c.interiorUnverified
      ? `${swatch(c.interiorUnverified, 'trim')}<b>${esc(c.interiorUnverified)}</b>`
        + ' <span class="feat-unknown">— не підтверджено за VIN</span>'
      : '<span class="feat-unknown">уточнюється за VIN</span>')]);
  pairs.push(['Планки салону', finishLine(c, d)]);
  pairs.push(['Ціна в Кореї', c.koreaPriceMan
    ? `<span class="num">${c.koreaPriceMan.toLocaleString('uk-UA').replace(/\s/g, '\u00a0')}</span>\u00a0만원`
    : null]);
  const note = d && d.engineNote ? `<p class="note">${esc(d.engineNote)}</p>` : '';
  return `<section class="panel"><h2>Що це за авто</h2>${rows(pairs)}${finishFigure(c, d)}${note}</section>`;
}

/** Планка салону — рядок у таблиці фактів. Джерело лише білд-лист: у фото
 *  оголошення вставку майже не спіймати, а продавці про неї не пишуть. */
function finishLine(c, d) {
  const f = c.trimFinish || finishFromOptions(d);
  if (!f) return '<span class="feat-unknown">уточнюється за VIN</span>';
  const spec = trimSpec(f);
  const bits = [`<b>${esc(trimName(f))}</b>`, `<span class="num">${esc(f.code)}</span>`];
  if (spec && f.en) bits.push(`<span class="opt-en">${esc(f.en)}</span>`);
  return bits.join(' · ');
}

/** Індекс може відставати від деталі (білд-лист щойно вставили руками) —
 *  тоді беремо планку прямо з опцій. */
function finishFromOptions(d) {
  const codes = ['S4KK', 'S4KM', 'S4KP', 'S4KR', 'S4KT', 'S4ML', 'S4MC'];
  for (const o of (d && d.options) || []) {
    if (codes.includes(o.code) || /interior trim finish|trim finishers/i.test(o.desc || '')) {
      return { code: o.code, en: o.desc || '' };
    }
  }
  return null;
}

/** Візуал планки: схема мотиву й матеріалу, а не фото деталі. Підпис це
 *  проговорює — за правилом проєкту вигадане зображення не має видаватись
 *  за знімок конкретного авто. */
function finishFigure(c, d) {
  const f = c.trimFinish || finishFromOptions(d);
  if (!f) return '';
  const spec = trimSpec(f);
  return `<figure class="finish-figure">
    ${trimStrip(f, { h: 40 })}
    <figcaption>${spec
      ? `Мотив і матеріал вставки — <b>${esc(spec.family)}</b>, схематично. `
      : 'Мотив цієї планки в каталозі сайту ще не описаний. '
      }Планка стоїть на панелі приладів, дверях і центральному тунелі; на фото
      з оголошення її ракурсом майже не спіймати, тому єдине джерело — білд-лист за VIN.</figcaption>
  </figure>`;
}

function panelCalc(c, b) {
  if (!b) {
    return `<section class="panel"><h2>Скільку віддати</h2>
      <p class="note">Для ${c.year} року немає фіксованої митної вартості в таблиці — розклад платежів не порахувати.</p></section>`;
  }
  const line = (label, note, value) =>
    `<tr><td>${esc(label)}${note ? `<span class="calc-note">${note}</span>` : ''}</td><td>${value}</td></tr>`;

  return `<section class="panel"><h2>Скільку віддати</h2>
    <table class="calc">
      <tbody>
        ${line('Авто в Кореї', `${krwM(b.carKRW)} за курсом ${KRW_PER_USD}\u00a0₩/$`, usd(b.car))}
        ${line('Мито', `10% від митної вартості ${usd(b.P)}`, usd(b.duty))}
        ${line('Акциз', `дизель 3,0 л, вік ${b.age} р. на ${AGE_BASE}`, usd(b.excise))}
        ${line('ПДВ', '20% від вартості з митом і акцизом', usd(b.vat))}
        ${line('Пенсійний збір і облік', 'збір 5% + сертифікація та реєстрація', usd(b.registration))}
        ${line('Доставка', 'Корея → Україна', usd(b.shipping))}
        ${line('Послуги', 'підбір, оформлення, супровід', usd(b.service))}
      </tbody>
      <tfoot><tr><td>Під ключ у Києві</td><td>${usd(b.total)}</td></tr></tfoot>
    </table>
    <p class="note">Мито, акциз і ПДВ рахуються від фіксованої митної вартості <span class="num">${usd(b.P)}</span>
      для ${c.year} року виготовлення, а не від корейської ціни. Тому платежі однакові для всіх авто цього року,
      а вигідна покупка в Кореї відбивається один-в-один у ціні під ключ.</p>
    ${c.priceEstimated ? `<p class="note"><b>Це оцінка.</b> Митну вартість <span class="num">${usd(b.P)}</span>
      звірено зі скріншотами для X5; для X6 узято ту саму таблицю. Своя таблиця в X6 вища, тож фактично
      варто очікувати на $1000–2000 більше — потрібен один розрахунок carspy по X6, щоб її закріпити.</p>` : ''}
  </section>`;
}

function panelFeatures(c, d) {
  const kf = (d && d.keyFeatures) || c.keyFeatures;
  // Нотатка потрібна саме тоді, коли опцій ще немає — там і живуть спостереження
  // з фото, тож вона рендериться в обох гілках.
  const note = c.note ? `<p class="note">${esc(c.note)}</p>` : '';
  if (!kf) {
    // Пневмо — єдина опція, яку варто показати й без білд-листа: вона важлива
    // для комфорту, ретрофіт нереальний, а продавці про неї часто пишуть.
    const air = d && typeof d.airSeller === 'boolean' ? d.airSeller : null;
    const airLine = air === null ? '' : `<p class="note"><b>Пневмопідвіска ${air
      ? 'є' : 'немає'}</b> — зі слів продавця, не підтверджено білд-листом за VIN.
      Ретрофіт нереальний ($6000–10 000), тож це властивість авто назавжди.</p>`;
    return `<section class="panel"><h2>Ключові опції</h2>
      <p class="pending">Комплектація ще не розшифрована. ${c.vin
        ? 'VIN є — потрібно прогнати білд-лист BMW, і опції зʼявляться тут.'
        : 'Encar для цього лота VIN не показує, тому білд-лист поки не зняти — доглядач перевіряє щогодини.'}</p>
      ${airLine}${note}</section>`;
  }
  const items = KEY_FEATURES.map((f) => {
    const { has, long } = featureState(kf, f);
    return `<li class="${has ? 'feat-yes' : 'feat-no'}">${has ? '✓ ' : ''}${esc(long)}</li>`;
  }).join('');
  return `<section class="panel"><h2>Ключові опції</h2>
    <ul class="feature-grid">${items}</ul>
    ${note}</section>`;
}

/** «1 звернення · 2 звернення · 5 звернень» */
function plural(n, one, few, many) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function panelHistory(d) {
  const h = d && d.history && !d.history.http ? d.history : null;
  if (!h) {
    return `<section class="panel"><h2>Історія</h2>
      <p class="pending">Виписку з корейського реєстру для цього лота ще не знято.</p></section>`;
  }
  const clean = !h.myAccidentCnt && !h.otherAccidentCnt;
  return `<section class="panel"><h2>Історія</h2>
    ${rows([
      ['Власний ремонт', h.myAccidentCnt
        ? `<span class="num">${h.myAccidentCnt}</span> ${plural(h.myAccidentCnt, 'звернення', 'звернення', 'звернень')} на <span class="num">${krw(h.myAccidentCost || 0)}</span>`
        : '<span class="feat-yes">не було</span>'],
      ['Ремонт іншим за рахунок цього авто', h.otherAccidentCnt
        ? `<span class="num">${h.otherAccidentCnt}</span> на <span class="num">${krw(h.otherAccidentCost || 0)}</span>`
        : 'не було'],
      ['Різних ДТП', incidentCount(h) == null
        ? '<span class="dim">детальних записів немає</span>'
        : (incidentCount(h)
          ? `<span class="num">${incidentCount(h)}</span> — за унікальними датами, `
            + `страхових записів <span class="num">${(h.accidents || []).length}</span>`
          : '<span class="feat-yes">не було</span>')],
      ['Змін власника', `<span class="num">${h.ownerChangeCnt}</span>`],
      ['Списання / потоп', h.totalLoss || h.flood
        ? '<b>є позначка — не брати</b>'
        : '<span class="feat-yes">чисто</span>'],
    ])}
    ${incidentList(h)}
    <p class="note">${clean
      ? 'За виплатами страховика авто без ремонтів.'
      : `Виплати на власний ремонт — ${krwM(h.myAccidentCost || 0)}, це нижче за поріг 5 млн ₩, який ми тримаємо.`}</p>
  </section>`;
}

/** Кількість РІЗНИХ ДТП: Encar рахує страхові записи, а одне ДТП дає два,
 *  якщо виплата йшла і власнику, і потерпілій стороні. Тому — унікальні дати. */
function incidentCount(h) {
  if (!h.accidents) return null;
  return new Set(h.accidents.map((a) => a.date).filter(Boolean)).size;
}

const ACC_TYPE = {
  1: 'своя страховка',
  2: 'страховка іншої сторони',
  3: 'шкода іншому авто',
};

/** Розклад по датах — щоб було видно, чому ДТП менше, ніж «cases» в Encar. */
function incidentList(h) {
  const acc = h.accidents || [];
  if (!acc.length) return '';
  const byDate = new Map();
  for (const a of acc) {
    if (!a.date) continue;
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }
  const rows = [...byDate.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([date, list]) => {
    const parts = list.map((a) => {
      const sum = (a.partCost || 0) + (a.laborCost || 0) + (a.paintingCost || 0);
      return `${ACC_TYPE[a.type] || `тип ${a.type}`} — ${sum ? krw(sum) : 'без суми'}`;
    }).join('; ');
    return `<li><span class="num">${date}</span> — ${parts}</li>`;
  });
  return `<ul class="acc-list">${rows.join('')}</ul>`;
}

/** Що пише продавець в описі оголошення — джерело поза API й білд-листом.
 *  kind: plus (аргумент за) · minus (насторожує) · info (просто факт). */
const SELLER_MARK = { plus: '+', minus: '!', info: '·' };

function factsList(fs) {
  return fs.map((f) => {
    const kind = SELLER_MARK[f.kind] ? f.kind : 'info';
    return `<li class="fact fact-${kind}"><span class="fact-mark" aria-hidden="true">${SELLER_MARK[kind]}</span>${esc(f.text)}</li>`;
  }).join('');
}

function panelSeller(c, d) {
  const fs = (d && d.sellerFacts) || [];
  if (!fs.length) return '';
  return `<section class="panel panel-wide"><h2>Що пише продавець</h2>
    <ul class="facts">${factsList(fs)}</ul>
    <p class="note">Це слова продавця з опису на Encar, а не перевірені дані. Корисне саме
      тим, що частину цього немає ні в API, ні в білд-листі за VIN — ключі, залишок протектора,
      продовжена гарантія, визнані кузовні роботи. Розбіжності з реєстром виплат позначені «!».</p>
  </section>`;
}

/** Державний звіт про стан (성능점검기록부) — найтвердіше джерело в добірці. */
function panelInspection(c, d) {
  const insp = d && d.inspection;
  const fs = (d && d.inspectionFacts) || [];
  if (!insp) {
    return `<section class="panel panel-wide"><h2>Звіт інспекції</h2>
      <p class="pending">Для цього лота Encar звіту про стан не віддає.</p></section>`;
  }
  const when = insp.date
    ? `${insp.date.slice(6, 8)}.${insp.date.slice(4, 6)}.${insp.date.slice(0, 4)}`
    : null;
  const meta = [
    when ? `перевірено ${when}` : null,
    insp.mileage ? `пробіг на інспекції ${km(insp.mileage)}` : null,
    insp.recall ? 'відкликання виконано' : null,
  ].filter(Boolean).join(' · ');
  return `<section class="panel panel-wide"><h2>Звіт інспекції</h2>
    <ul class="facts">${factsList(fs)}</ul>
    ${meta ? `<p class="note">${esc(meta)}.</p>` : ''}
    ${insp.comment ? `<p class="note note-quote">Коментар інспектора: «${esc(insp.comment)}»</p>` : ''}
    <p class="note">Це державний звіт про стан (성능점검기록부), а не слова продавця. Заміна
      накладних деталей — капота, крил, дверей, кришки багажника — у Кореї вважається дрібним
      ремонтом; зварювання каркаса це вже інша розмова, і саме через нього стоїть позначка
      «ДТП каркаса».</p>
  </section>`;
}

function panelOptions(c, d) {
  if (!d || !d.options) {
    return `<section class="panel panel-wide"><h2>Повна комплектація за VIN</h2>
      <p class="pending">Білд-лист ще не знято.${c.vin
        ? ` VIN <span class="num">${esc(c.vin)}</span> — можна декодувати на mdecoder.com.`
        : ' VIN для цього лота Encar не показує.'}</p></section>`;
  }
  const groups = groupOptions(d.options).map((g) => `
    <div class="opt-group">
      <h3>${esc(g.title)}</h3>
      <ul class="opt-list">${g.items.map((o) => `
        <li class="${o.key ? 'opt-key' : ''}"><code>${esc(o.code)}</code>
          <span>${esc(o.uk || o.en)}${o.uk ? `<br><span class="opt-en">${esc(o.en)}</span>` : ''}</span>
        </li>`).join('')}</ul>
    </div>`).join('');
  return `<section class="panel panel-wide"><h2>Повна комплектація за VIN — ${d.options.length} позицій</h2>
    <div class="opt-columns">${groups}</div></section>`;
}
