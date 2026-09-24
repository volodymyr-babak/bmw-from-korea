/* Спільне: форматери, тема, дрібні хелпери */

/** Курс для перерахунку корейської ціни в долари. Ціни в оголошеннях —
 *  у 만원 (1만원 = 10 000 ₩), долари показуємо як довідку. */
export const KRW_PER_USD = 1372;

const NBSP = ' ';

/** 52327 → "52 327" (нерозривні пробіли, щоб число не ламалось) */
function group(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export const usd = (n) => '$' + group(n);
export const km = (n) => group(n) + NBSP + 'км';
export const krw = (n) => group(n) + NBSP + '₩';
/** 49894000 → "49,9 млн ₩" */
export const krwM = (n) => (n / 1e6).toFixed(1).replace('.', ',') + NBSP + 'млн' + NBSP + '₩';

/** 3190 (만원) → "3 190 만원" — рівно те число, що стоїть в оголошенні Encar */
export const man = (n) => group(n) + NBSP + '만원';
/** 3190 (만원) → 23251 — корейська ціна в доларах за курсом KRW_PER_USD */
export const manToUSD = (n) => Math.round(n * 10000 / KRW_PER_USD);
/** 3190 → "≈ $23 251" — довідка до корейської ціни, тому зі знаком приблизності */
export const manUSD = (n) => '≈' + NBSP + usd(manToUSD(n));

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

/** Покоління Ranger за класифікацією Encar: 3세대 — T6 (рестайлінг, до 2022),
 *  4세대 — нова платформа (2023+). */
export function genLabel(gen) {
  if (gen === 3) return 'T6 · 3 пок.';
  if (gen === 4) return '4 пок.';
  return gen ? `${gen} пок.` : '';
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
