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
  { id: 'hud',       short: 'HUD',            long: 'Проекція на скло (Head-up Display)' },
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
