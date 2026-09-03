/* Глосарій опцій BMW (SA-коди) — українські назви та групування.
   Джерело кодів: білд-листи mdecoder.com за VIN. */

export const GROUPS = [
  ['pkg',      'Пакети'],
  ['colors',   'Фарба й оббивка'],
  ['chassis',  'Шасі, гальма, привід'],
  ['wheels',   'Колеса й шини'],
  ['light',    'Світло'],
  ['assist',   'Асистенти й безпека'],
  ['seats',    'Сидіння'],
  ['climate',  'Клімат і комфорт'],
  ['interior', 'Оздоблення салону'],
  ['exterior', 'Кузов, дах, скло'],
  ['media',    'Мультимедіа та звʼязок'],
  ['tech',     'Технічне й регіональне'],
];

/** code → [група, українська назва, ключова?] */
export const OPTIONS = {
  S337: ['pkg', 'Пакет M Sport'],
  S715: ['pkg', 'Аеродинамічний пакет M'],
  S418: ['pkg', 'Пакет багажного відділення'],
  S4FL: ['pkg', 'Рейкова система Travel & Comfort'],

  SA96:  ['colors', 'Фарба Mineral White металік'],
  SC1M:  ['colors', 'Фарба Phytonic Blue металік'],
  SC27:  ['colors', 'Фарба Arctic Grey металік'],
  S416:  ['colors', 'Фарба Carbon Black металік'],
  SMCHF: ['colors', 'Оббивка шкіра Vernasca Coffee'],
  SMCSW: ['colors', 'Оббивка шкіра Vernasca Black'],

  S2VR: ['chassis', 'Пневмопідвіска на дві осі', true],
  S2VF: ['chassis', 'Adaptive M chassis — адаптивні амортизатори з пружинами (це НЕ пневмо)', true],
  S2VH: ['chassis', 'Integral Active Steering — підрулювання задньої осі'],
  S2NH: ['chassis', 'Гальма M Sport'],
  S2TB: ['chassis', 'Спортивний автомат Steptronic'],
  S2VB: ['chassis', 'Індикація тиску в шинах'],
  S212: ['chassis', 'Гальмівна система для конкретного ринку'],
  S1MA: ['chassis', 'Вихлопна система M Sport', true],
  S1CE: ['chassis', '48V mild-hybrid: система рекуперації', true],
  SA090: ['chassis', 'AGM-акумулятор 90 А·год'],
  SDEBP: ['chassis', 'Блок керування 48V (PCU48GEN1)'],

  S1TC: ['wheels', 'Диски 20" star spoke 740M'],
  S1XN: ['wheels', 'Диски 21" Y-spoke 741M'],
  S258: ['wheels', 'Шини runflat'],

  S552: ['light', 'Адаптивні LED-фари', true],
  S5AZ: ['light', 'BMW Laserlight — лазерні фари', true],
  S5A1: ['light', 'LED-протитуманки'],
  S5AC: ['light', 'Асистент дальнього світла'],

  S5AU: ['assist', 'Driving Assistant Professional', true],
  S6UN: ['assist', 'BMW Night Vision — нічне бачення', true],
  S5DN: ['assist', 'Асистент паркування Plus'],
  S5AL: ['assist', 'Active Protection'],
  S5AV: ['assist', 'Active Guard'],
  S8TF: ['assist', 'Активний захист пішоходів'],
  S428: ['assist', 'Знак аварійної зупинки й аптечка'],
  S6AC: ['assist', 'Інтелектуальний екстрений виклик'],

  S453: ['seats', 'Вентиляція передніх сидінь', true],
  S456: ['seats', 'Комфортні сидіння з памʼяттю', true],
  S459: ['seats', 'Електрорегулювання сидінь із памʼяттю'],
  S481: ['seats', 'Спортивні сидіння'],
  S488: ['seats', 'Люмбальна підтримка водія й пасажира'],
  S4HA: ['seats', 'Підігрів сидінь: передні + задні', true],
  S4HB: ['seats', 'Heat Comfort — підігрів керма й підлокітників', true],

  S4NB: ['climate', 'Клімат-контроль, 4 зони', true],
  S322: ['climate', 'Comfort Access — безключовий доступ'],
  S3DS: ['climate', 'BMW Display Key'],
  S323: ['climate', 'Soft-Close-Automatic двері', true],
  S4T8: ['climate', 'Розширений пакет дзеркал'],
  S417: ['climate', 'Шторки на задніх дверях'],
  S8S3: ['climate', 'Автоблокування дверей при рушанні'],

  S4AW: ['interior', 'Панель приладів у шкірі Sensatec'],
  S4KK: ['interior', 'Вставки салону — алюміній Tetragon'],
  S4KM: ['interior', 'Вставки салону — алюміній Mesh Effect темний'],
  // Нижче — варіанти планок, яких у нашій добірці ще не траплялось; назви
  // з переліку G05 від користувача, коди в білд-листі перевіримо на першому ж авто.
  S4KP: ['interior', 'Вставки салону — ясен Brown-Metallic, глянець'],
  S4KR: ['interior', 'Вставки салону — дерево Fineline Stripe коричневе, глянець'],
  S4KT: ['interior', 'Вставки салону — тополя Anthracite-Brown, відкриті пори'],
  S4ML: ['interior', 'Вставки салону — BMW Individual Piano Finish Black'],
  S4MC: ['interior', 'Вставки салону — карбон'],
  S44A: ['interior', 'Підстаканники з підігрівом і охолодженням'],
  S4UR: ['interior', 'Ambient — фонове підсвічування салону'],
  S4A2: ['interior', 'Crafted Clarity — кришталеві елементи iDrive'],
  S710: ['interior', 'Шкіряне кермо M'],
  S248: ['interior', 'Підігрів керма окремою опцією (без пакета S4HB)', true],
  S4M5: ['interior', 'Шкіряна панель приладів BMW Individual'],
  S423: ['interior', 'Велюрові килимки'],
  S775: ['interior', 'Стеля антрацит'],

  S402: ['exterior', 'Панорамний скляний дах', true],
  S407: ['exterior', 'Панорама Sky Lounge — з підсвіткою', true],
  S3KA: ['exterior', 'Акустичне багатошарове скло бічних дверей', true],
  S3AC: ['exterior', 'Фаркоп зі знімною сферою'],
  S3AT: ['exterior', 'Рейлінги — сатинований алюміній'],
  S3MB: ['exterior', 'Individual Exterior Line — темний алюміній'],
  S3DN: ['exterior', 'Решітка BMW Iconic Glow — підсвічені ніздрі'],
  S3D0: ['exterior', 'Iconic Glow тимчасово не встановлено — з підготовкою до дистанційного оновлення ПЗ'],
  S9AA: ['exterior', 'Захист зовнішнього покриття'],

  S610: ['media', 'Head-up Display', true],
  S688: ['media', 'Harman/Kardon Surround Sound', true],
  S6F1: ['media', 'Bowers & Wilkins High End — топова аудіосистема', true],
  S6AR: ['media', 'Bowers & Wilkins High End (старе позначення)', true],
  S676: ['media', 'Базова аудіосистема HiFi (не Harman/Kardon)'],
  S6UX: ['media', 'Контролер iDrive без тач-панелі (корейська версія)'],
  S6UY: ['media', 'Сенсорні функції скасовано — екран без тач-керування'],
  S6U8: ['media', 'Керування жестами'],
  S6U3: ['media', 'BMW Live Cockpit Professional'],
  S6C3: ['media', 'Connected Package Professional'],
  S6CP: ['media', 'Підготовка Apple CarPlay'],
  S6NV: ['media', 'Телефонія з бездротовою заряджанням'],
  S6NS: ['media', 'Комфортна телефонія з розширеним смартфон-інтерфейсом'],
  S6AK: ['media', 'ConnectedDrive Services'],
  S6AE: ['media', 'Teleservices'],
  S6UH: ['media', 'Інформація про трафік'],
  S699: ['media', 'DVD-регіон 3'],

  S548: ['tech', 'Спідометр у км/год'],
  S802: ['tech', 'Національна версія: Корея'],
  S867: ['tech', 'Мова інтерфейсу: корейська'],
  S8AF: ['tech', 'Бортова документація корейською'],
  S8R9: ['tech', 'Холодоагент R1234yf'],
  S8SX: ['tech', 'Керування телематик-провайдером'],
  S8TR: ['tech', 'Декодування додаткових функцій'],
  S9WL: ['tech', 'Групування WLTP'],
  S993: ['tech', 'Код модельного року у VIN'],
  S8KH: ['tech', 'Інтервал заміни оливи 20 000 км / 18 місяців'],
  S925: ['tech', 'Пакет захисту при транспортуванні (Versandschutzpaket)'],
};

/** Розкладає список опцій авто на групи в стабільному порядку */
export function groupOptions(options) {
  const buckets = new Map(GROUPS.map(([id, title]) => [id, { id, title, items: [] }]));
  const other = { id: 'other', title: 'Інше', items: [] };
  for (const o of options) {
    const g = OPTIONS[o.code];
    const item = { code: o.code, uk: g ? g[1] : null, en: o.desc, key: !!(g && g[2]) };
    (g ? buckets.get(g[0]) : other).items.push(item);
  }
  const out = [...buckets.values()].filter((b) => b.items.length);
  if (other.items.length) out.push(other);
  return out;
}
