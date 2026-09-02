#!/usr/bin/env python3
"""Декодування VIN через mdecoder.com.

Особливості сервісу (з досвіду):
- перша відповідь — порожня оболонка «Data will be available in 30 seconds»,
  дані приходять на другому запиті приблизно через 30 с, з тим самим cookie jar;
- добовий ліміт на IP: сторінка з title «Limited access» і текстом «daily limit».
  Свіжий jar його НЕ обходить, скидається наступної доби.

Парсер написаний захищено: якщо розмітка не збіглася, повертаємо status='unparsed'
і сирий HTML, щоб не записати в дані вигадку.
"""
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass, field

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
URL = 'https://www.mdecoder.com/decode/{}'

MIN_CODES = 25          # менше — точно не повний білд-лист

# S-коди → ключові опції сайту.
# Опції, що є в усіх декодованих (acc, park, comfort, seatheat, wheelheat,
# climate4, exhaust), лишаємо свідомо: «8 з 8» — властивість малої вибірки, тож
# нове авто без них має відзначитись у рядку, а не отримати опцію за замовчуванням.
# wheelheat: підігрів керма дає пакет S4HB Heat Comfort; S248 — та сама функція
# окремою опцією (разом не зустрічаються, бо пакет її перекриває).
FEATURE_CODES = {
    'air':       ['S2VR'],
    'laser':     ['S5AZ'],
    'led':       ['S552'],
    'soft':      ['S323'],
    'vent':      ['S453'],
    'hk':        ['S688'],
    'bw':        ['S6F1', 'S6AR'],
    'pano':      ['S402', 'S407'],
    'skylounge': ['S407'],
    'acoustic':  ['S3KA'],
    'mhev':      ['S1CE'],
    'acc':       ['S5AU'],
    'park':      ['S5DN'],
    'comfort':   ['S322'],
    'seatheat':  ['S4HA'],
    'wheelheat': ['S4HB', 'S248'],
    'climate4':  ['S4NB'],
    'exhaust':   ['S1MA'],
}

PAINT_HINTS = ('metallic', 'brillanteffekt', 'uni', 'einfarbig', 'effekt')
TRIM_HINTS = ('vernasca', 'merino', 'sensatec', 'nappa', 'leather', 'leder')


@dataclass
class Result:
    status: str                      # ok | partial | quota | shell | unparsed | http
    vin: str
    html: str = ''
    options: list = field(default_factory=list)
    paint: str | None = None
    trim: str | None = None
    paint_code: str | None = None
    trim_code: str | None = None
    note: str = ''


def _fetch(vin: str, jar: str, tries: int = 3, wait: int = 32):
    """Запит із cookie jar і полінгом. Повертає (код, html)."""
    last = ''
    for i in range(tries):
        r = subprocess.run(
            ['curl', '-s', '-w', '\n%{http_code}', '--max-time', '40',
             '-c', jar, '-b', jar, '-H', f'User-Agent: {UA}', URL.format(vin)],
            capture_output=True, text=True)
        body, _, code = r.stdout.rpartition('\n')
        code = code.strip()
        last = body
        if code != '200':
            return code, body
        if 'daily limit' in body or '<title>Limited access' in body:
            return '200', body
        if 'Data will be available' not in body and _looks_like_data(body):
            return '200', body
        if i < tries - 1:
            time.sleep(wait)
    return '200', last


def _looks_like_data(html: str) -> bool:
    return len(_codes(html)) >= MIN_CODES


def _text(html: str) -> str:
    h = re.sub(r'<(script|style)\b.*?</\1>', ' ', html, flags=re.S | re.I)
    h = re.sub(r'<!--.*?-->', ' ', h, flags=re.S)
    h = re.sub(r'<[^>]+>', '\n', h)
    h = re.sub(r'&nbsp;?', ' ', h)
    h = re.sub(r'&amp;', '&', h)
    return h


def _codes(html: str) -> list:
    """Пари (код, опис). Дві стратегії — розмітка таблиці і плоский текст."""
    found, seen = [], set()

    # A: <td>S337</td><td>M Sports package</td> (і будь-які теги-обгортки)
    # між кодом і описом зазвичай 1–3 теги: </td><td>, </span></div><div> тощо
    for code, desc in re.findall(
            r'>\s*(S[0-9A-Z]{3,4}|SA?\d{3})\s*(?:<[^>]*>\s*){1,3}([^<>]{3,150}?)\s*<', html):
        code = code.strip()
        if code not in seen:
            seen.add(code)
            found.append((code, ' '.join(desc.split())))
    if len(found) >= MIN_CODES:
        return found

    # B: рядки «S337 M Sports package» / «S337 - M Sports package»
    found, seen = [], set()
    for line in _text(html).split('\n'):
        line = ' '.join(line.split())
        m = re.match(r'^(S[0-9A-Z]{3,4}|SA?\d{3})\s*[-–—|:]?\s+(.{3,150})$', line)
        if m and m.group(1) not in seen:
            seen.add(m.group(1))
            found.append((m.group(1), m.group(2).strip()))
    return found


def _colour(html: str, hints) -> tuple:
    """(назва, код BMW) для фарби або оббивки — за характерними словами."""
    for line in _text(html).split('\n'):
        line = ' '.join(line.split())
        if not 3 < len(line) < 120:
            continue
        low = line.lower()
        if not any(h in low for h in hints):
            continue
        m = re.search(r'\b([0-9A-Z]{3,4})\b\s*[-–—|:]?\s*(.+)$', line)
        if m and not m.group(1).startswith('S'):
            return ' '.join(m.group(2).split()), m.group(1)
        return line, None
    return None, None


def key_features(codes) -> dict:
    """Ключові опції з набору S-кодів. B&W вищий за H/K, тому взаємно виключні."""
    have = {c.upper() for c, _ in codes}
    kf = {k: any(c in have for c in v) for k, v in FEATURE_CODES.items()}
    if kf.get('bw'):
        kf['hk'] = False
    else:
        kf.pop('bw', None)
    return kf


def decode(vin: str) -> Result:
    with tempfile.TemporaryDirectory() as tmp:
        code, html = _fetch(vin, f'{tmp}/jar.txt')

    if code != '200':
        return Result('http', vin, note=f'HTTP {code}')
    if 'daily limit' in html or '<title>Limited access' in html:
        return Result('quota', vin, note='добову квоту вичерпано')
    if 'Data will be available' in html:
        return Result('shell', vin, html, note='дані не встигли підготуватись')

    codes = _codes(html)
    if len(codes) < MIN_CODES:
        return Result('unparsed', vin, html,
                      note=f'розпізнано лише {len(codes)} кодів')

    paint, paint_code = _colour(html, PAINT_HINTS)
    trim, trim_code = _colour(html, TRIM_HINTS)
    status = 'ok' if (paint and trim) else 'partial'
    missing = [n for n, v in (('фарба', paint), ('оббивка', trim)) if not v]
    return Result(status, vin, '' if status == 'ok' else html,
                  options=[{'code': c, 'desc': d} for c, d in codes],
                  paint=paint, trim=trim, paint_code=paint_code, trim_code=trim_code,
                  note='' if status == 'ok' else 'не розпізнано: ' + ', '.join(missing))
