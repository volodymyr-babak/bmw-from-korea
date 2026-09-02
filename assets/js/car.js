import {
  usd, km, krw, krwM, breakdown, KEY_FEATURES, featureState, encarUrl, MARKS, photoUrl,
  initTheme, esc, KRW_PER_USD, AGE_BASE, BUDGET_CAP,
} from './common.js';
import { groupOptions } from './options.js';

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
    <div class="panels">
      <div class="panel-col">${panelIdentity(c, d)}${panelCalc(c, b)}</div>
      <div class="panel-col">${panelFeatures(c, d)}${panelHistory(d)}</div>
    </div>
    ${panelOptions(c, d)}`;
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

function colorLine(side) {
  if (!side || !side.name) return null;
  const bits = [`<b>${esc(side.name)}</b>`];
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
  pairs.push(['Колір кузова', colorLine(d && d.exterior) || (c.exterior ? `<b>${esc(c.exterior)}</b>` : null)]);
  // Пріоритет: білд-лист за VIN → колір з індексу → опис продавця (він збігається
  // з VIN там, де є обидва, але це все ж слова продавця, тому позначаємо).
  pairs.push(['Салон', colorLine(d && d.interior) || (c.interior ? `<b>${esc(c.interior)}</b>` : null)
    || (c.interiorSeller
      ? `<b>${esc(c.interiorSeller)}</b> <span class="feat-unknown">— за описом продавця, не за VIN</span>`
      : '<span class="feat-unknown">уточнюється за VIN</span>')]);
  pairs.push(['Ціна в Кореї', c.koreaPriceMan
    ? `<span class="num">${c.koreaPriceMan.toLocaleString('uk-UA').replace(/\s/g, '\u00a0')}</span>\u00a0만원`
    : null]);
  const note = d && d.engineNote ? `<p class="note">${esc(d.engineNote)}</p>` : '';
  return `<section class="panel"><h2>Що це за авто</h2>${rows(pairs)}${note}</section>`;
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
    return `<section class="panel"><h2>Ключові опції</h2>
      <p class="pending">Комплектація ще не розшифрована. ${c.vin
        ? 'VIN є — потрібно прогнати білд-лист BMW, і опції зʼявляться тут.'
        : 'Encar для цього лота VIN не показує, тому білд-лист поки не зняти — доглядач перевіряє щогодини.'}</p>
      ${note}</section>`;
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
      ['Змін власника', `<span class="num">${h.ownerChangeCnt}</span>`],
      ['Списання / потоп', h.totalLoss || h.flood
        ? '<b>є позначка — не брати</b>'
        : '<span class="feat-yes">чисто</span>'],
    ])}
    <p class="note">${clean
      ? 'За виплатами страховика авто без ремонтів.'
      : `Виплати на власний ремонт — ${krwM(h.myAccidentCost || 0)}, це нижче за поріг 5 млн ₩, який ми тримаємо.`}</p>
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
