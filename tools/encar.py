#!/usr/bin/env python3
"""Клієнт Encar API.

Проксі egress періодично віддає HTTP 407 — рятують ретраї в циклі.
404 і 400 вважаємо остаточними: 404 на деталі означає, що оголошення знято.
"""
import json
import subprocess
import time
import urllib.parse

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
REFERER = 'https://fem.encar.com/'

DETAIL = 'https://api.encar.com/v1/readside/vehicle/{}'
RECORD = 'https://api.encar.com/v1/readside/record/vehicle/{}/open'
INSPECTION = 'https://api.encar.com/v1/readside/inspection/vehicle/{}'
SEARCH = 'https://api.encar.com/search/car/list/general'
PHOTO_BASE = 'https://ci.encar.com'

FINAL_CODES = {'200', '400', '404'}

# Серверні фільтри Encar (перевірено 2026-09-24). Ford Ranger в Encar:
# Manufacturer `포드`, ModelGroup `레인저`, Model — `레인저 3세대` (T6, 2019–2022)
# або `레인저 4세대` (2023+); Badge = двигун `2.0`, а комплектація лежить у
# BadgeDetail: `와일드트랙` (Wildtrak) / `랩터` (Raptor).
# Пастки синтаксису: `Model` усередині ModelGroup обов'язковий ЛИШЕ у формі
# `(C.ModelGroup.X._.Model.Y.)`; щоб узяти всі покоління разом, ModelGroup
# пишеться без вкладеного C.: `(C.Manufacturer.포드._.ModelGroup.레인저.)`.
# BadgeDetail, Year і SellType — тільки ТОП-РІВНЕМ, усередині дають 400.
MANUFACTURER = '포드'
MODEL_GROUP = '레인저'
BADGE_DETAIL = '와일드트랙'

# Покоління з поля `Model` Encar → як показуємо в себе
GENERATIONS = {'레인저 3세대': 3, '레인저 4세대': 4}


def get(url: str, tries: int = 8, pause: float = 1.2):
    """(http_code, text). Ретраїмо все, що не в FINAL_CODES."""
    code, body = '000', ''
    for i in range(tries):
        r = subprocess.run(
            ['curl', '-s', '-w', '\n%{http_code}', '--max-time', '25',
             '-H', f'User-Agent: {UA}', '-H', f'Referer: {REFERER}', url],
            capture_output=True, text=True)
        body, _, code = r.stdout.rpartition('\n')
        code = code.strip()
        if code in FINAL_CODES:
            return code, body
        time.sleep(pause * (i + 1))
    return code, body


def get_json(url: str, **kw):
    code, body = get(url, **kw)
    if code != '200':
        return code, None
    try:
        return code, json.loads(body)
    except json.JSONDecodeError:
        return 'BADJSON', None


def detail(listing_id: str):
    return get_json(DETAIL.format(listing_id))


def inspection(vehicle_id):
    """Державний звіт про стан. 404 — звіту немає, це нормально."""
    return get_json(INSPECTION.format(vehicle_id))


def record(vehicle_id):
    return get_json(RECORD.format(vehicle_id))


def _query(year_from: int) -> str:
    return (f'(And.Hidden.N._.(C.CarType.A._.(C.Manufacturer.{MANUFACTURER}._.'
            f'ModelGroup.{MODEL_GROUP}.))'
            f'_.Year.range({year_from}00..).'
            f'_.SellType.일반.'
            f'_.BadgeDetail.{BADGE_DETAIL}.)')


def search(year_from: int, page_size: int = 20, hard_cap: int = 600):
    """Усі оголошення Ranger Wildtrak від року `year_from` (виготовлення).
    Повертає (список, Count). Лізинг і оренда відсіяні сервером (SellType.일반)."""
    q = urllib.parse.quote(_query(year_from), safe='')
    out, offset, total = [], 0, None
    while True:
        url = f'{SEARCH}?count=true&q={q}&sr=%7CModifiedDate%7C{offset}%7C{page_size}'
        code, d = get_json(url)
        if code != '200' or not d:
            raise RuntimeError(f'пошук Ranger: HTTP {code}')
        total = d.get('Count', 0)
        page = d.get('SearchResults') or []
        out += page
        if not page or len(out) >= min(total, hard_cap):
            return out, total
        offset += page_size


def generation(model_name: str):
    """3 або 4 з `Model` Encar; None — незнайоме покоління."""
    return GENERATIONS.get((model_name or '').strip())


def frame_no(path: str) -> int:
    """Номер кадру з шляху Encar (…_001.jpg → 1); без номера — в кінець."""
    import re
    m = re.search(r'_(\d+)\.jpg$', path)
    return int(m.group(1)) if m else 999


def photos(det: dict) -> dict:
    """OUTER та INNER, відсортовані за номером кадру (_001 — головний ракурс)."""
    out = {'outer': [], 'inner': []}
    for p in det.get('photos') or []:
        if p.get('type') == 'OUTER':
            out['outer'].append(p['path'])
        elif p.get('type') == 'INNER':
            out['inner'].append(p['path'])
    for k in out:
        out[k].sort(key=frame_no)
    return out


def sale_state(det: dict):
    """(продано?, причина). Пастка: у проданих status і далі 'ADVERTISE'."""
    ad = det.get('advertisement') or {}
    if ad.get('salesStatus'):
        return True, f'продано — salesStatus={ad["salesStatus"]}'
    if ad.get('price') == 9999:
        return True, 'ціну приховано (9999만) — зазвичай супроводжує продаж'
    return False, None
