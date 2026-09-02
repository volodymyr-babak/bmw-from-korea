/* Спільне: формула розмитнення, форматери, тема, ключові опції */

export const KRW_PER_USD = 1372;
export const EUR_USD = 1.1648;
export const EXCISE_RATE_EUR = 75;      // €/л дизель
export const ENGINE_L = 3.0;            // митниця бере 2993 см³ → 3.0 л
export const AGE_BASE = 2025;
export const SHIPPING = 3700;
export const SERVICE = 1000;
export const CERT_REG = 124;            // сертифікація $79 + реєстрація $45
export const BUDGET_CAP = 70000;
export const LADDER_FLOOR = 50000;

/** Фіксована мінімальна митна вартість P (USD) за роком виготовлення */
export const MIN_CUSTOMS_VALUE = { 2019: 25000, 2020: 36000, 2021: 40500, 2022: 43000 };

const r = (x) => Math.floor(x + 0.5);

/**
 * Розкладає ціну «під ключ» на складові.
 * Мита рахуються від фіксованої P за роком, а не від корейської ціни.
 * Якщо відома корейська ціна (в 만원) — вартість авто беремо з неї,
 * інакше виводимо як залишок: car = total - усі збори.
 */
export function breakdown(year, totalUSD, koreaPriceMan) {
  const P = MIN_CUSTOMS_VALUE[year];
  if (!P) return null;
  const age = AGE_BASE - year;
  const duty = 0.1 * P;
  const excise = EXCISE_RATE_EUR * ENGINE_L * age * EUR_USD;
  const vat = 0.2 * (P + duty + excise);
  const pension = 0.05 * P;
  const customs = r(duty) + r(excise) + r(vat);
  const registration = r(pension) + CERT_REG;
  const fees = customs + registration + SHIPPING + SERVICE;
  const car = koreaPriceMan ? r(koreaPriceMan * 10000 / KRW_PER_USD) : totalUSD - fees;
  return {
    P, age,
    car,
    carKRW: koreaPriceMan ? koreaPriceMan * 10000 : car * KRW_PER_USD,
    duty: r(duty),
    excise: r(excise),
    vat: r(vat),
    customs,
    pension: r(pension),
    registration,
    shipping: SHIPPING,
    service: SERVICE,
    fees,
    total: car + fees,
  };
}

const NBSP = ' ';

/** 52327 → "52 327" (нерозривні пробіли, щоб число не ламалось) */
function group(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export const usd = (n) => '$' + group(n);
export const km = (n) => group(n) + NBSP + 'км';
export const krw = (n) => group(n) + NBSP + '₩';
/** 49894000 → "49,9 млн ₩" */
export const krwM = (n) => (n / 1e6).toFixed(1).replace('.', ',') + NBSP + 'млн' + NBSP + '₩';

/** Ключові опції — однаковий набір і порядок усюди.
 *  Слоти light, audio і roof адаптивні: показують найвищий тир, який реально є
 *  (лазер понад адаптивний LED, B&W понад Harman/Kardon, Sky Lounge понад
 *  звичайну панораму). Так один слот несе більше інформації, ніж галочка.
 *
 *  Опції, наявні в усіх декодованих (ACC, M-вихлоп, підігріви, HUD, 4-зона,
 *  Comfort Access, камери), лишаємо в рядку СВІДОМО: «в усіх є» — властивість
 *  вибірки з 8 авто, а не G05/G06. Нове авто без них ми маємо побачити, а не
 *  домалювати їй опцію в уяві. */
export const KEY_FEATURES = [
  { id: 'air',       short: 'пневмо',         long: 'Пневмопідвіска на дві осі' },
  { id: 'light',     short: 'адапт. LED',     long: 'Адаптивні LED-фари' },
  { id: 'acc',       short: 'ACC',            long: 'Adaptive Cruise Control — основа пакета Driving Assistant Professional' },
  { id: 'park',      short: 'камери 360',     long: 'Асистент паркування Plus — камери навколо авто' },
  { id: 'soft',      short: 'soft-close',     long: 'Soft-Close двері' },
  { id: 'comfort',   short: 'безключовий',    long: 'Comfort Access — безключовий доступ і запуск' },
  { id: 'vent',      short: 'вентиляція',     long: 'Вентиляція передніх сидінь' },
  { id: 'seatheat',  short: 'підігрів задн.', long: 'Підігрів сидінь спереду й позаду' },
  { id: 'wheelheat', short: 'підігрів керма', long: 'Підігрів керма (пакет Heat Comfort)' },
  { id: 'climate4',  short: '4-зона',         long: '4-зонний клімат-контроль' },
  { id: 'audio',     short: 'H/K',            long: 'Harman/Kardon' },
  { id: 'roof',      short: 'панорама',       long: 'Панорамний дах' },
  { id: 'acoustic',  short: 'акуст. скло',    long: 'Акустичне скло (S3KA)' },
  { id: 'exhaust',   short: 'M-вихлоп',       long: 'Вихлопна система M Sport' },
  { id: 'mhev',      short: '48V',            long: '48V mild-hybrid' },
];

/** Стан одного слота: {has, short, long}. Адаптивні слоти показують вищий тир. */
export function featureState(kf, f) {
  switch (f.id) {
    case 'light':
      if (kf.laser) return { has: true, short: 'лазер', long: 'BMW Laserlight' };
      return { has: !!kf.led, short: 'адапт. LED', long: 'Адаптивні LED-фари' };
    case 'audio':
      if (kf.bw) return { has: true, short: 'B&W', long: 'Bowers & Wilkins High End' };
      return { has: !!kf.hk, short: 'H/K', long: 'Harman/Kardon Surround' };
    case 'roof':
      if (kf.skylounge) {
        return { has: true, short: 'Sky Lounge', long: 'Панорама Sky Lounge з підсвіткою' };
      }
      return { has: !!kf.pano, short: 'панорама', long: 'Панорамний скляний дах' };
    default:
      return { has: !!kf[f.id], short: f.short, long: f.long };
  }
}

export const encarUrl = (id) => `https://fem.encar.com/cars/detail/${id}`;

const CI = 'https://ci.encar.com';
/** Фото з CDN Encar у потрібному розмірі (усі 16:9, як в оригіналі) */
const PHOTO_SIZES = {
  thumb: 'rh=158&cw=280&ch=158',
  card:  'rh=360&cw=640&ch=360',
  large: 'rh=450&cw=800&ch=450',
};
export function photoUrl(path, size = 'card') {
  if (!path) return null;
  return `${CI}${path}?impolicy=heightRate&${PHOTO_SIZES[size] || PHOTO_SIZES.card}&cg=Center`;
}

/* ---- кольори: фарба кузова й оббивка ---- */

/** Зразок фарби для квадратика біля назви кольору.
 *  Ключі — і код BMW, і назва в нижньому регістрі (в індексі лежить лише назва,
 *  а в недекодованих авто — переклад корейської назви з Encar).
 *  Відтінки знято з рендерів заводської конфігурації bimmer.work (медіана по
 *  борту авто), тому вони ближчі до реальної фарби, ніж каталожні картинки. */
const PAINT_COLORS = {
  '416': '#1d1f26', 'carbon black': '#1d1f26',
  'a96': '#e9e8e3', 'mineral white': '#e9e8e3',
  'c27': '#74777b', 'arctic grey': '#74777b',
  'c3d': '#6e6a5c', 'manhattan': '#6e6a5c',
  'c1m': '#2f5a86', 'phytonic blue': '#2f5a86',
  // назви з Encar — поки немає білд-листа за VIN
  'чорний': '#22242a',
  'білий': '#ededea',
  'перловий': '#e8e3d8',
  'сірий': '#767a7d',
  'синій': '#2f5a86',
  'небесно-блакитний': '#9fb6c8',
  'коричневий': '#6b5a45',
  'бронзовий': '#6a6559',
};

/** Зразок оббивки. Відтінки знято з тих самих рендерів — медіана по спинках
 *  і подушках передніх сидінь (центральний тунель вирізаний), піднята до того,
 *  як шкіра виглядає при денному світлі. Cognac і Canberra Beige взяті з
 *  референсних рендерів уже відсіяних VIN, щоб їх було чим малювати, якщо
 *  подібне авто з'явиться знову. */
const TRIM_COLORS = {
  'mchf': '#5b4638', 'vernasca coffee': '#5b4638',
  'vahf': '#55402f', 'merino coffee': '#55402f',
  'mcsw': '#2c2c2e', 'vernasca black': '#2c2c2e',
  'mcri': '#96663c', 'vernasca cognac': '#96663c',
  'mcfy': '#b9ab93', 'canberra beige': '#b9ab93',
  'merino tartufo': '#6d5344',
  'ivory white': '#ddd6c8',
  'tacora red': '#7c2026',
};

/** Непідтверджений салон приходить фразою («чорний — з фото»), тому по ній
 *  шукаємо ключове слово. «Коричневий» СВІДОМО не мапимо: це або кава, або
 *  cognac, і вигадувати відповідь тут — та сама помилка, через яку `42244757`
 *  півдня рахувався кавовим. */
const TRIM_RULES = [
  [/coffee|кав|мокко|шоколад/i, '#5b4638'],
  [/black|чорн/i, '#2c2c2e'],
  [/cognac|кон.як|рудий/i, '#96663c'],
  [/tartufo/i, '#6d5344'],
  [/ivory|айвор|beige|беж/i, '#ddd6c8'],
  [/tacora|червон/i, '#7c2026'],
];

const PALETTES = { paint: PAINT_COLORS, trim: TRIM_COLORS };

/** hex за кодом або назвою; null — коли відтінок невідомий.
 *  `kind`: 'paint' — фарба кузова, 'trim' — оббивка. */
export function colorHex(side, kind = 'paint') {
  if (!side) return null;
  const map = PALETTES[kind] || PAINT_COLORS;
  const keys = typeof side === 'string' ? [side] : [side.code, side.name, side.german];
  for (const k of keys) {
    if (!k) continue;
    const hit = map[String(k).toLowerCase()];
    if (hit) return hit;
  }
  if (kind === 'trim') {
    const text = typeof side === 'string' ? side : [side.name, side.german].join(' ');
    for (const [re, hex] of TRIM_RULES) {
      if (re.test(text)) return hex;
    }
  }
  return null;
}

/** Квадратик кольору. Невідомий відтінок — штрихування, а не вигаданий колір. */
export function swatch(side, kind = 'paint') {
  const hex = colorHex(side, kind);
  return hex
    ? `<span class="swatch" style="--swatch:${hex}" aria-hidden="true"></span>`
    : '<span class="swatch swatch-unknown" title="Відтінок не звірений" aria-hidden="true"></span>';
}

/** Кураторські маркери з даних. Суперлативи («найдешевше») тут не тримаємо —
 *  список оновлюється автоматично, тому їх рахує index.js на рендері. */
export const MARKS = {
  'hero': 'вибір №1',
  'star': 'малий пробіг',
};

/* ---- тема ---- */

export function initTheme() {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    btn.textContent = t === 'dark' ? 'Світла тема' : 'Темна тема';
    btn.setAttribute('aria-label', t === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему');
  };
  apply(document.documentElement.dataset.theme || 'light');
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('bmwk-theme', next); } catch (e) { /* приватний режим */ }
    apply(next);
  });
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
