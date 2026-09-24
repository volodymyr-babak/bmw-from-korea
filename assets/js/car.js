import {
  man, manUSD, km, krw, krwM, encarUrl, MARKS, photoUrl, initTheme, esc, KRW_PER_USD, genLabel,
} from './common.js';

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

  // детальний файл є в кожного авто: фото, історія, звіт інспекції, текст оголошення
  let detail = null;
  try {
    const res = await fetch(`data/cars/${id}.json`, { cache: 'no-cache' });
    if (res.ok) detail = await res.json();
  } catch (e) { /* показуємо те, що є в індексі */ }

  document.title = `${summary.year} Ranger ${summary.trim || ''} · ${man(summary.koreaPriceMan)} — Ranger з Кореї`;
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
  const priceLine = c.koreaPriceMan
    ? `<span class="amount">${man(c.koreaPriceMan)}</span>
      <span class="amount-note">ціна в оголошенні на Encar · ${
        manUSD(c.koreaPriceMan)} за курсом ${KRW_PER_USD} ₩/$</span>`
    : '<span class="amount-note">Ціни в оголошенні немає — дивитись на Encar.</span>';
  const gen = c.gen ? ` · ${esc(genLabel(c.gen))}` : '';
  $('#head').innerHTML = `
    <h1 class="detail-title">Ford Ranger ${esc(c.trim || '')} 2.0${gen}<br>${c.year} року, <span class="num">${km(c.mileageKm)}</span>${badge}</h1>
    <p class="detail-price">${priceLine}</p>
    <p class="detail-actions">
      <a class="btn" href="${encarUrl(c.listingId)}" rel="noopener noreferrer" target="_blank">Відкрити оголошення на Encar</a>
      <a class="btn btn-quiet" href="index.html">Усі ${meta.count} кандидатів</a>
    </p>`;
}

function renderBody(c, d) {
  $('#body').innerHTML = `
    ${gallery(c, d)}
    <div class="panels">
      <div class="panel-col">${panelIdentity(c, d)}</div>
      <div class="panel-col">${panelHistory(d)}</div>
    </div>
    ${panelInspection(c, d)}
    ${panelSeller(c, d)}`;
}

function shotsOf(d) {
  const ph = (d && d.photos) || {};
  return [
    ...(ph.outer || []).map((p) => ({ path: p, kind: 'кузов' })),
    ...(ph.inner || []).map((p) => ({ path: p, kind: 'салон' })),
  ];
}

/** Фото з оголошення: велике + смужка мініатюр (кузов, потім салон) */
function gallery(c, d) {
  const shots = shotsOf(d);
  if (!shots.length) return '';
  const alt = `Ranger ${c.trim || ''} ${c.year}, лот ${c.listingId}`;
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
  const shots = shotsOf(d);
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

const KO_COLOR = {
  '흰색': 'білий', '검정색': 'чорний', '청색': 'синій', '쥐색': 'сірий', '회색': 'сірий',
  '진주색': 'перловий', '은색': 'срібний', '갈색': 'коричневий', '남색': 'темно-синій',
  '주황색': 'помаранчевий', '빨간색': 'червоний', '녹색': 'зелений', '연금색': 'бронзовий',
  '하늘색': 'небесно-блакитний', '기타': 'інший',
};

function panelIdentity(c, d) {
  const pairs = [
    ['VIN', c.vin ? `<span class="num">${esc(c.vin)}</span>` : 'відсутній в Encar'],
    ['Лот на Encar', `<span class="num">${esc(c.listingId)}</span>`],
    ['Комплектація', c.trim ? esc(c.trim) : null],
    ['Покоління', c.gen ? esc(genLabel(c.gen)) + (d && d.encarModel ? ` <span class="opt-en">${esc(d.encarModel)}</span>` : '') : null],
    ['Рік виготовлення', `<span class="num">${c.year}</span>`],
    ['Модельний рік (연식)', d && d.formYear ? `<span class="num">${esc(d.formYear)}</span>` : null],
    ['Пробіг', `<span class="num">${km(c.mileageKm)}</span>`],
    ['Колір кузова', d && d.colorName ? esc(KO_COLOR[d.colorName] || d.colorName) : null],
  ];
  const note = c.note ? `<p class="note">${esc(c.note)}</p>` : '';
  return `<section class="panel"><h2>Що це за авто</h2>${rows(pairs)}${note}</section>`;
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
  const inc = incidentCount(h);
  return `<section class="panel"><h2>Історія</h2>
    ${rows([
      ['Власний ремонт', h.myAccidentCnt
        ? `<span class="num">${h.myAccidentCnt}</span> ${plural(h.myAccidentCnt, 'звернення', 'звернення', 'звернень')} на <span class="num">${krw(h.myAccidentCost || 0)}</span>`
        : '<span class="feat-yes">не було</span>'],
      ['Ремонт іншим за рахунок цього авто', h.otherAccidentCnt
        ? `<span class="num">${h.otherAccidentCnt}</span> на <span class="num">${krw(h.otherAccidentCost || 0)}</span>`
        : 'не було'],
      ['Різних ДТП', inc == null
        ? '<span class="dim">детальних записів немає</span>'
        : (inc
          ? `<span class="num">${inc}</span> — за унікальними датами, `
            + `страхових записів <span class="num">${(h.accidents || []).length}</span>`
          : '<span class="feat-yes">не було</span>')],
      ['Змін власника', `<span class="num">${h.ownerChangeCnt}</span>`],
      ['Перша реєстрація', h.firstDate ? `<span class="num">${esc(h.firstDate)}</span>` : null],
      ['Списання / потоп', h.totalLossCnt || h.floodTotalLossCnt || h.floodPartLossCnt
        ? '<b>є позначка — не брати</b>'
        : '<span class="feat-yes">чисто</span>'],
    ])}
    ${incidentList(h)}
    <p class="note">${clean
      ? 'За виплатами страховика авто без ремонтів.'
      : `Виплати на власний ремонт — ${krwM(h.myAccidentCost || 0)}.`}</p>
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
  const items = [...byDate.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([date, list]) => {
    const parts = list.map((a) => {
      const sum = (a.partCost || 0) + (a.laborCost || 0) + (a.paintingCost || 0);
      return `${ACC_TYPE[a.type] || `тип ${a.type}`} — ${sum ? krw(sum) : 'без суми'}`;
    }).join('; ');
    return `<li><span class="num">${date}</span> — ${parts}</li>`;
  });
  return `<ul class="acc-list">${items.join('')}</ul>`;
}

const SELLER_MARK = { plus: '+', minus: '!', info: '·' };

function factsList(fs) {
  return fs.map((f) => {
    const kind = SELLER_MARK[f.kind] ? f.kind : 'info';
    return `<li class="fact fact-${kind}"><span class="fact-mark" aria-hidden="true">${SELLER_MARK[kind]}</span>${esc(f.text)}</li>`;
  }).join('');
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
      накладних деталей — капота, крил, дверей, борта — у Кореї вважається дрібним
      ремонтом; зварювання каркаса це вже інша розмова, і саме через нього стоїть позначка
      «ДТП каркаса».</p>
  </section>`;
}

/** Сирий текст оголошення — корейською, згорнутий. Там буває те, чого немає
 *  в API: ключі, протектор, гарантія, визнані кузовні роботи. */
function panelSeller(c, d) {
  const text = d && d.sellerText;
  if (!text || !text.trim()) return '';
  return `<section class="panel panel-wide"><h2>Що пише продавець</h2>
    <details class="seller-text"><summary>Показати текст оголошення (корейською)</summary>
      <pre>${esc(text.trim())}</pre></details>
    <p class="note">Це слова продавця з опису на Encar, а не перевірені дані.</p>
  </section>`;
}
