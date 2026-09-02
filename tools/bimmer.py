#!/usr/bin/env python3
"""Декодування VIN через офіційний API bimmer.work.

Токен беремо ЛИШЕ з оточення (`BIMMER_TOKEN`) — у репозиторій він не потрапляє.
Trial-доступ прив'язаний до акаунта користувача й має термін дії; коли він
скінчиться, лишається шлях «користувач сам робить запит у браузері й віддає
текст» (див. CLAUDE.md).

    BIMMER_TOKEN=… python3 tools/bimmer.py            # усі недекодовані з VIN
    BIMMER_TOKEN=… python3 tools/bimmer.py <VIN> …     # конкретні VIN, без запису
    BIMMER_TOKEN=… python3 tools/bimmer.py --images    # рендери заводської конфігурації

Відповідь: список з одним об'єктом; `status` = OKAY / IN PROGRESS / FAILED.
Поля: model, ecode, type, chassis, market, engine, color, upholstery, date,
production, options{код: {en, de}}, images{exterior, interior}.
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mdecoder import key_features  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'cars.json'
CARS = ROOT / 'data' / 'cars'
RAW = Path(os.environ.get('BIMMER_RAW', '')) if os.environ.get('BIMMER_RAW') else None

API = 'https://bimmer.work/api/v1/vin/{vin}/?token={token}'
SOURCE = 'bimmer.work API'

# Англійські назви фарб за кодом BMW — API віддає лише німецьку.
PAINT_NAMES = {
    '416': 'Carbon Black',
    'A96': 'Mineral White',
    'C1M': 'Phytonic Blue',
    'C27': 'Arctic Grey',
    'C3D': 'Manhattan',
    'C4A': 'Tanzanite Blue',
    '475': 'Black Sapphire',
    '300': 'Alpine White',
    'A90': 'Sophisto Grey',
    'C31': 'Dravit Grey',
    'C57': 'Aventurine Red',
    'A89': 'Glacier Silver',
    'B39': 'Mineral Grey',
}

# Салони, які виключені критеріями (ключ — фрагмент назви в нижньому регістрі).
BAD_TRIM = {
    'cognac': 'Vernasca Cognac',
    'elfenbein': 'Ivory White',
    'ivory': 'Ivory White',
    'tacora': 'Tacora Red',
    'rot': 'червоний',
}


def fetch(vin: str, token: str, tries: int = 10, wait: int = 15) -> dict:
    """Запит із полінгом. Повертає розпакований об'єкт або {'status': …}."""
    url = API.format(vin=vin, token=token)
    last = {'status': 'NO RESPONSE'}
    for attempt in range(tries):
        proc = subprocess.run(
            ['curl', '-sS', '-m', '45', '-w', '\n%{http_code}', url],
            capture_output=True, text=True,
        )
        body, _, code = proc.stdout.rpartition('\n')
        if code != '200':                       # проксі періодично віддає 407
            last = {'status': f'HTTP {code or "?"}'}
            time.sleep(3)
            continue
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            last = {'status': 'BAD JSON'}
            time.sleep(3)
            continue
        item = data[0] if isinstance(data, list) and data else data
        status = item.get('status')
        if status == 'OKAY':
            return item
        last = item
        if status != 'IN PROGRESS':              # FAILED — далі полінг не допоможе
            return item
        if attempt < tries - 1:
            time.sleep(wait)
    return last


def _clean(text: str) -> str:
    text = html.unescape(text or '').strip()
    return text[:1].upper() + text[1:] if text else text


def _split_named_code(value: str) -> tuple[str, str | None]:
    """'Carbonschwarz Metallic (416)' → ('Carbonschwarz Metallic', '416')."""
    m = re.match(r'^(.*?)\s*\(([^()]+)\)\s*$', value or '')
    return (m.group(1).strip(), m.group(2).strip()) if m else ((value or '').strip(), None)


def paint(value: str) -> dict:
    german, code = _split_named_code(value)
    return {'name': PAINT_NAMES.get(code or '', german), 'german': german, 'code': code}


def trim(value: str) -> dict:
    german, code = _split_named_code(value)
    # 'Leder Merino coffee' → 'Merino Coffee'; 'Leather Vernasca black' → 'Vernasca Black'
    short = re.sub(r'^(leder|leather|stoff|sensatec)\s+', '', german, flags=re.I)
    name = ' '.join(w if w.isupper() else w.capitalize() for w in short.split())
    german = ' '.join(w if w.isupper() else w.capitalize() for w in german.split())
    return {'name': name, 'german': german, 'code': code}


def engine_fields(value: str, codes: set[str], production: str) -> dict:
    """'3.00l / 210kW (B57P)' → engine/power/engineNote."""
    kw = re.search(r'(\d{2,3})\s*kW', value or '')
    code = re.search(r'\(([^()]+)\)', value or '')
    kw = int(kw.group(1)) if kw else None
    power = {195: '195 кВт / 265 к.с. · 620 Нм',
             210: '210 кВт / 286 к.с. · 650 Нм'}.get(kw, f'{kw} кВт' if kw else None)
    plant = (production or '').split('/')[0].strip()
    if 'S1CE' in codes:
        note = ('48V mild-hybrid (S1CE) — версія 210 кВт / 286 к.с., потужніша за '
                'B57D30O0 (195 кВт / 265 к.с.).')
    else:
        note = ('Без 48V — 195 кВт / 265 к.с. Доліфтова версія двигуна; '
                'на модельних 2021+ (з mild-hybrid) 210 кВт / 286 к.с.')
    if plant:
        note += f' Завод {plant}.'
    return {'engine': code.group(1) if code else None, 'power': power, 'engineNote': note}


def corpus_descs() -> dict:
    """Описи опцій, які вже є в проєкті — щоб формулювання не розповзалися."""
    descs = {}
    for path in list((ROOT / 'data' / 'cars').glob('*.json')) + \
                list((ROOT / 'data' / 'sold').glob('*.json')):
        for opt in json.loads(path.read_text()).get('options', []):
            descs.setdefault(opt['code'], opt['desc'])
    return descs


def build(item: dict, descs: dict) -> dict:
    codes = ['S' + c for c in item.get('options', {})]
    opts = [{'code': c,
             'desc': (descs.get(c) or _clean(item['options'][c[1:]].get('en'))
                      or _clean(item['options'][c[1:]].get('de')))}
            for c in sorted(codes)]
    out = {
        'prodDate': item.get('date'),
        **engine_fields(item.get('engine', ''), set(codes), item.get('production', '')),
        'exterior': paint(item.get('color', '')),
        'interior': trim(item.get('upholstery', '')),
        'options': opts,
        'keyFeatures': key_features([(o['code'], o['desc']) for o in opts]),
        'decodeSource': SOURCE,
    }
    return {k: v for k, v in out.items() if v is not None}


def bad_trim(name: str) -> str | None:
    low = (name or '').lower()
    for needle, label in BAD_TRIM.items():
        if needle in low:
            return label
    return None


RENDERS = ROOT / 'assets' / 'renders'
RENDER_WIDTH = 1000          # 1280×768 оригінал → 1000 px достатньо для сторінки авто
RENDER_BG = '#ffffff'        # PNG прозорий; кладемо на біле, як і фото з оголошення


def save_render(url: str, token: str, dest: Path) -> bool:
    """Завантажити PNG-рендер і покласти як JPEG (оригінал ~0,4–0,9 МБ → ~50 КБ)."""
    tmp = dest.with_suffix('.png')
    r = subprocess.run(['curl', '-sS', '-m', '90', '-w', '%{http_code}',
                        '-o', str(tmp), f'{url}?token={token}'],
                       capture_output=True, text=True)
    if r.stdout.strip() != '200' or not tmp.exists() or tmp.stat().st_size < 5000:
        tmp.unlink(missing_ok=True)
        return False
    conv = subprocess.run(['convert', str(tmp), '-resize', f'{RENDER_WIDTH}x',
                           '-background', RENDER_BG, '-flatten', '-strip',
                           '-quality', '84', str(dest)], capture_output=True, text=True)
    tmp.unlink(missing_ok=True)
    return conv.returncode == 0 and dest.exists()


def images_mode(token: str) -> int:
    """Рендери заводської конфігурації за VIN — еталон кольору кузова й салону."""
    RENDERS.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX.read_text())
    todo = [c for c in index['cars'] if c.get('vin')]
    print(f'авто з VIN: {len(todo)}')
    for car in todo:
        lid, vin = car['listingId'], car['vin']
        path = CARS / f'{lid}.json'
        data = json.loads(path.read_text()) if path.exists() else {'listingId': lid}
        item = fetch(vin, token)
        urls = item.get('images') or {}
        if item.get('status') != 'OKAY' or not urls:
            print(f'  {lid} {vin} — {item.get("status")}, рендерів немає')
            continue
        got = {}
        for kind, short in (('exterior', 'ext'), ('interior', 'int')):
            if not urls.get(kind):
                continue
            rel = f'assets/renders/{vin}-{short}.jpg'
            dest = ROOT / rel
            if dest.exists() or save_render(urls[kind], token, dest):
                got[kind] = rel
        if got:
            data['renders'] = got
            with path.open('w') as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
                fh.write('\n')
        sizes = ' '.join(f'{k[:3]} {(ROOT / v).stat().st_size // 1024} КБ'
                         for k, v in got.items())
        print(f'  {lid} {vin} — {sizes or "нічого не зберегли"}')
    return 0


def main(argv: list[str]) -> int:
    token = os.environ.get('BIMMER_TOKEN')
    if not token:
        print('немає BIMMER_TOKEN у оточенні', file=sys.stderr)
        return 2
    if argv and argv[0] == '--images':
        return images_mode(token)

    descs = corpus_descs()

    if argv:                                     # пробний режим: лише показати
        for vin in argv:
            item = fetch(vin, token)
            print(vin, item.get('status'))
            if item.get('status') == 'OKAY':
                built = build(item, descs)
                print(json.dumps({k: v for k, v in built.items() if k != 'options'},
                                 ensure_ascii=False, indent=1))
                print('опцій:', len(built['options']))
        return 0

    index = json.loads(INDEX.read_text())
    todo = [c for c in index['cars'] if c.get('vin') and not c.get('decoded')]
    print(f'декодувати: {len(todo)}')
    flagged, failed = [], []
    for car in todo:
        lid, vin = car['listingId'], car['vin']
        item = fetch(vin, token)
        if item.get('status') != 'OKAY':
            print(f'  {lid} {vin} — {item.get("status")}')
            failed.append((lid, vin, item.get('status')))
            continue
        if RAW:
            RAW.mkdir(parents=True, exist_ok=True)
            (RAW / f'{vin}.json').write_text(json.dumps(item, ensure_ascii=False, indent=1))
        built = build(item, descs)
        path = CARS / f'{lid}.json'
        data = json.loads(path.read_text()) if path.exists() else {'listingId': lid}
        data.update(built)
        with path.open('w') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        why = bad_trim(built['interior']['name'])
        mark = f'  ⛔ {why}' if why else ''
        print(f'  {lid} {vin} — {built["interior"]["name"]} ({built["interior"]["code"]}), '
              f'{built["exterior"]["name"]}, опцій {len(built["options"])}{mark}')
        if why:
            flagged.append((lid, vin, why))
        descs = {**descs, **{o['code']: o['desc'] for o in built['options']}}

    if flagged:
        print('\nсалон під виключення (вирішує користувач):')
        for lid, vin, why in flagged:
            print(f'  {lid} {vin} — {why}')
    if failed:
        print('\nне вийшло:')
        for lid, vin, status in failed:
            print(f'  {lid} {vin} — {status}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
