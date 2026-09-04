/* Спільне: форматери, тема, ключові опції */

/** Курс для перерахунку корейської ціни в долари. Ціни в оголошеннях —
 *  у 만원 (1만원 = 10 000 ₩), долари показуємо як довідку. */
export const KRW_PER_USD = 1372;

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

/** 6380 (만원) → "6 380 만원" — рівно те число, що стоїть в оголошенні Encar */
export const man = (n) => group(n) + NBSP + '만원';
/** 6380 (만원) → 46501 — корейська ціна в доларах за курсом KRW_PER_USD */
export const manToUSD = (n) => Math.round(n * 10000 / KRW_PER_USD);
/** 6380 → "≈ $46 501" — довідка до корейської ціни, тому зі знаком приблизності */
export const manUSD = (n) => '≈' + NBSP + usd(manToUSD(n));

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
  // Білд-лист пише німецьким одним словом — без цього ключа спрацьовувало б
  // загальне правило для бежевого й давало відтінок айворі, світліший за MCFY.
  'vernasca canberrabeige': '#b9ab93', 'leder vernasca canberrabeige': '#b9ab93',
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
  // Еталон комплектації: усі 14 слотів рядка опцій закриті. Це не «вибір №1»,
  // а орієнтир — з чим порівнювати решту, коли зважуєш ціну проти оснащення.
  'spec': 'еталон комплектації',
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
