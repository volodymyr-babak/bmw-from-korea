/* Декоративні планки салону (BMW Interior trim finishers) — каталог і візуалізація.

   Планка — це вставки на панелі приладів, дверях і центральному тунелі. У
   білд-листі вона завжди рівно одна, кодом `S4K…` / `S4M…`, і на фото
   оголошення її майже не видно: кадр «салон» знімають ширше, а в жовтому
   світлі дилерського боксу алюміній Tetragon і темний Mesh виглядають однаково.
   Тому тут малюємо їх схематично — це не фото деталі, а те, який мотив
   і в якому матеріалі стоїть за білд-листом.

   ⚠️ Провенанс кодів. На живих білд-листах нашої добірки трапляються лише
   `S4KK` (15 авто) і `S4KM` (6) — їхні англійські назви взяті просто з
   білд-листа. Решта кодів — з переліку варіантів G05, який дав користувач;
   у наших авто вони поки не траплялись, тож малюнок для них зроблений «на
   виріст». Код, якого немає в цій таблиці, НЕ вигадуємо: показуємо
   англійський опис із білд-листа й штрихування замість мотиву. */

/** motif: diamond — кутастий геометричний алюміній · mesh — плетена сітка ·
 *  grain — деревні волокна · weave — карбонове плетиво 2×2 · gloss — рояльний
 *  лак без мотиву. matte — приглушити відблиск (відкриті пори, мат). */
export const TRIMS = {
  S4KK: {
    name: 'Алюміній Tetragon', short: 'Tetragon', family: 'алюміній',
    motif: 'diamond', base: '#8b9198', ink: '#474d54', lite: '#ccd1d6',
  },
  S4KM: {
    name: 'Алюміній Mesh Effect, темний', short: 'Mesh', family: 'алюміній',
    motif: 'mesh', base: '#4b5057', ink: '#23272b', lite: '#868c93',
  },
  S4KP: {
    name: 'Ясен Brown-Metallic, глянець', short: 'Ясен', family: 'дерево',
    motif: 'grain', base: '#6b4a34', ink: '#3d2a1d', lite: '#a87c5c',
  },
  S4KR: {
    name: 'Fineline Stripe, коричневе дерево, глянець', short: 'Fineline', family: 'дерево',
    motif: 'grain', base: '#4a3524', ink: '#281c12', lite: '#7d5f45',
  },
  S4KT: {
    name: 'Тополя Anthracite-Brown, відкриті пори', short: 'Тополя', family: 'дерево',
    motif: 'grain', base: '#3b3a37', ink: '#232322', lite: '#5d5b56', matte: true,
  },
  S4ML: {
    name: 'BMW Individual Piano Finish Black', short: 'Piano Black', family: 'лак',
    motif: 'gloss', base: '#15171a', ink: '#000000', lite: '#6a7079',
  },
  S4MC: {
    name: 'Карбон', short: 'Карбон', family: 'карбон',
    motif: 'weave', base: '#2c2f34', ink: '#15171a', lite: '#565c65',
  },
};

/** Планка з білд-листа: {code, en} → повний опис або null для незнайомого коду. */
export function trimSpec(finish) {
  return finish && TRIMS[finish.code] ? TRIMS[finish.code] : null;
}

/** Коротка назва для таблиці: наша — якщо код знайомий, інакше англійська
 *  з білд-листа, обрізана. Ніколи не вигадуємо назву за кодом. */
export function trimShort(finish) {
  if (!finish) return null;
  const t = TRIMS[finish.code];
  return t ? t.short : (finish.en || finish.code);
}

export function trimName(finish) {
  if (!finish) return null;
  const t = TRIMS[finish.code];
  return t ? t.name : (finish.en || finish.code);
}

/* ---- малюнок ---- */

let uid = 0;

/** Мотив як SVG-<pattern> у користувацьких координатах (px готового елемента),
 *  тому крок візерунка не залежить від ширини планки: у вузькій клітинці
 *  таблиці й на широкій картці авто він однаковий, як на справжній деталі. */
function motif(t, id) {
  const o = t.matte ? 0.5 : 0.75;
  switch (t.motif) {
    case 'diamond':
      return `<pattern id="${id}p" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 4.5 L4.5 0 L9 4.5 L4.5 9 Z" fill="none"
          stroke="${t.ink}" stroke-width="0.9" opacity="${o}"/>
        <path d="M0 4.5 L4.5 0" fill="none" stroke="${t.lite}" stroke-width="0.7" opacity="0.5"/>
      </pattern>`;
    case 'mesh':
      return `<pattern id="${id}p" width="4" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 0 H4 M0 0 V4" fill="none" stroke="${t.ink}" stroke-width="0.8" opacity="${o}"/>
        <path d="M0 2 H4" fill="none" stroke="${t.lite}" stroke-width="0.6" opacity="0.35"/>
      </pattern>`;
    case 'grain':
      // Волокно дерева: тонкі горизонтальні лінії різної щільності, з розривами —
      // рівномірна сітка читалась би як тканина, а не як шпон.
      return `<pattern id="${id}p" width="34" height="7" patternUnits="userSpaceOnUse">
        <path d="M0 1 H34" stroke="${t.ink}" stroke-width="0.7" opacity="${o}" stroke-dasharray="19 4"/>
        <path d="M0 3 H34" stroke="${t.lite}" stroke-width="0.6" opacity="0.28" stroke-dasharray="11 7"/>
        <path d="M0 4.6 H34" stroke="${t.ink}" stroke-width="0.5" opacity="${o * 0.7}" stroke-dasharray="26 6"/>
        <path d="M0 6.3 H34" stroke="${t.ink}" stroke-width="0.8" opacity="${o * 0.55}" stroke-dasharray="8 12"/>
      </pattern>`;
    case 'weave':
      return `<pattern id="${id}p" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="${t.ink}" opacity="0.85"/>
        <rect x="4" y="4" width="4" height="4" fill="${t.ink}" opacity="0.85"/>
        <rect x="4" width="4" height="4" fill="${t.lite}" opacity="0.22"/>
        <rect y="4" width="4" height="4" fill="${t.lite}" opacity="0.22"/>
      </pattern>`;
    default:
      return '';
  }
}

/**
 * Схематична планка. `h` — висота в px; ширина завжди 100% контейнера,
 * тож у таблиці її задає колонка, а на сторінці авто — панель.
 * Незнайомий код малюємо штрихуванням, як і невідомий колір у `swatch()`.
 */
export function trimStrip(finish, { h = 14, cls = '' } = {}) {
  const t = trimSpec(finish);
  const label = trimName(finish) || 'планка невідома';
  if (!t) {
    return `<span class="tstrip tstrip-unknown ${cls}" style="height:${h}px"
      title="${escAttr(label)}" role="img" aria-label="${escAttr(label)}"></span>`;
  }
  const id = `t${++uid}`;
  // Відблиск робить із плаского прямокутника пластину: світло згори, тінь знизу.
  // На матових (відкриті пори) він приглушений, на рояльному лаку — різкий.
  const sheen = t.motif === 'gloss'
    ? `<stop offset="0" stop-color="#fff" stop-opacity="0.42"/>
       <stop offset="0.30" stop-color="#fff" stop-opacity="0.06"/>
       <stop offset="0.34" stop-color="#000" stop-opacity="0.22"/>
       <stop offset="1" stop-color="#000" stop-opacity="0.42"/>`
    : t.matte
      ? `<stop offset="0" stop-color="#fff" stop-opacity="0.12"/>
         <stop offset="1" stop-color="#000" stop-opacity="0.20"/>`
      : `<stop offset="0" stop-color="#fff" stop-opacity="0.30"/>
         <stop offset="0.45" stop-color="#fff" stop-opacity="0.04"/>
         <stop offset="1" stop-color="#000" stop-opacity="0.30"/>`;
  return `<svg class="tstrip ${cls}" width="100%" height="${h}" preserveAspectRatio="none"
    role="img" aria-label="${escAttr(label)}"><title>${escAttr(label)}</title>
    <defs>${motif(t, id)}
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">${sheen}</linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="${t.base}"/>
    ${t.motif === 'gloss' ? '' : `<rect width="100%" height="100%" fill="url(#${id}p)"/>`}
    <rect width="100%" height="100%" fill="url(#${id}s)"/>
  </svg>`;
}

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
