#!/usr/bin/env python3
"""Розбір share-сторінки декодера oemnavigations.com.

Сам декод робиться РУКАМИ в браузері (`https://oemnavigations.com/pages/vin-decoder-app`,
2 VIN на добу): запит вимагає капчу Cloudflare Turnstile, і обходити її ми не будемо.
Але кнопка share на сторінці результату віддає публічний URL
`https://oemnavigation.com/vin/<id>` (домен В ОДНИНІ, без `s`), який відкривається
без капчі — його й розбираємо.

    python3 tools/oemnav.py https://oemnavigation.com/vin/9H27574        # показати
    python3 tools/oemnav.py <url|файл.html> --write                      # + записати в data/
    python3 tools/oemnav.py <url> --write --id 42468210                  # явний лот

Чого немає в bimmer.work і заради чого це варто робити:
  * `Mileage (km)` + `Data Timestamp` — пробіг за даними BMW на дату останнього
    сервісного контакту. Незалежна перевірка одометра проти Encar і звіту інспекції.
  * `Start of Warranty` / `Delivery Date` — фактична перша реєстрація.
  * `Retailer` + `National Market Version` — хто продав нове і на який ринок.
  * `Actual Integration Level` — рівень ПЗ (коли востаннє оновлювали в дилера).

Формат кодів там інший: `01CE` замість нашого `S1CE` (нуль замість `S`). Перевірено
на 42468210 — усі 63 коди з bimmer.work збіглися код-у-код, OEM дав ще 4 записи
(фарба `C27`, оббивка `MCSW`, `A090` і `S321` без опису).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bimmer import bad_trim, corpus_descs, paint, trim  # noqa: E402
from mdecoder import key_features  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'cars.json'
CARS = ROOT / 'data' / 'cars'

SA_CODE = re.compile(r'^0[0-9A-Z]{3}$')      # 01CE, 0323 — SA-опції; C27/MCSW/A090 — ні
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126 Safari/537.36')


def strip_tags(chunk: str) -> str:
    return html.unescape(re.sub(r'<[^>]+>', '', chunk)).strip()


def load_html(src: str) -> str:
    path = Path(src)
    if path.exists():
        return path.read_text(encoding='utf-8', errors='replace')
    # Проксі egress періодично віддає 407 — той самий трюк, що в encar.py
    for _ in range(4):
        r = subprocess.run(['curl', '-sS', '-L', '-A', UA, src],
                           capture_output=True, text=True)
        if r.returncode == 0 and 'equipment-code' in r.stdout:
            return r.stdout
    sys.exit(f'не вдалося завантажити {src} (або сторінка без результату)')


def parse(page: str) -> dict:
    labels = [strip_tags(x) for x in re.findall(r'class="data-label"[^>]*>(.*?)</', page, re.S)]
    values = [strip_tags(x) for x in re.findall(r'class="data-value"[^>]*>(.*?)</', page, re.S)]
    fields = dict(zip(labels, values))
    items = re.findall(
        r'class="equipment-item"[^>]*>\s*<span class="equipment-code"[^>]*>(.*?)</span>(.*?)</div>',
        page, re.S)
    codes = {strip_tags(c): strip_tags(d) for c, d in items}
    if not fields.get('VIN'):
        sys.exit('на сторінці немає VIN — це не результат декодування')
    return {'fields': fields, 'codes': codes}


def build(parsed: dict, descs: dict) -> dict:
    f, codes = parsed['fields'], parsed['codes']
    sa = {'S' + c[1:]: d for c, d in codes.items() if SA_CODE.match(c)}
    opts = [{'code': c, 'desc': descs.get(c) or sa[c]} for c in sorted(sa)]

    paint_code = f.get('Paint Code') or ''
    trim_code = f.get('Upholstery Code') or ''
    paint_name = codes.get(paint_code) or f.get('Color') or ''
    trim_name = codes.get(trim_code) or ''

    out = {
        'vin': f.get('VIN'),
        'prodDate': f.get('Production Date'),
        'exterior': paint(f'{paint_name} ({paint_code})' if paint_code else paint_name),
        'interior': trim(f'{trim_name} ({trim_code})' if trim_code else trim_name),
        'options': opts,
        'keyFeatures': key_features([(o['code'], o['desc']) for o in opts]),
        'oem': {k: v for k, v in {
            'mileageKm': int(f['Mileage (km)']) if (f.get('Mileage (km)') or '').isdigit() else None,
            'mileageAt': (f.get('Data Timestamp') or '')[:10] or None,
            'warrantyStart': f.get('Start of Warranty'),
            'deliveryDate': f.get('Delivery Date'),
            'retailer': f.get('Retailer') or f.get('Delivering Retailer'),
            'market': f.get('National Market Version'),
            'integrationLevel': f.get('Actual Integration Level'),
        }.items() if v},
    }
    return {k: v for k, v in out.items() if v}


def odometer_note(oem: dict, listed_km: int | None) -> str | None:
    """Пробіг BMW проти пробігу в оголошенні. Головне — чи не скручений."""
    km, at = oem.get('mileageKm'), oem.get('mileageAt')
    if not km or not at or not listed_km:
        return None
    if listed_km < km:
        return (f'⛔ СКРУЧЕНИЙ? BMW бачив {km:,} км на {at}, '
                f'в оголошенні {listed_km:,} км — менше на {km - listed_km:,}'.replace(',', ' '))
    from datetime import date
    y, m, d = (int(x) for x in at.split('-'))
    months = max((date.today() - date(y, m, d)).days / 30.44, 0.5)
    per_year = (listed_km - km) / months * 12
    return (f'одометр: BMW {km:,} км на {at} → в оголошенні {listed_km:,} км, '
            f'це +{listed_km - km:,} за {months:.0f} міс ≈ {per_year:,.0f} км/рік'
            ).replace(',', ' ')


def find_listing(vin: str) -> tuple[str | None, int | None]:
    index = json.loads(INDEX.read_text())
    for car in index['cars']:
        if car.get('vin') == vin:
            return car['listingId'], car.get('mileageKm')
    return None, None


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('source', help='share-URL oemnavigation.com/vin/<id> або файл HTML')
    ap.add_argument('--write', action='store_true', help='записати в data/cars/<id>.json')
    ap.add_argument('--id', help='listingId, якщо VIN ще не в індексі')
    a = ap.parse_args(argv)

    parsed = parse(load_html(a.source))
    vin = parsed['fields']['VIN']
    lid, listed_km = find_listing(vin)
    lid = a.id or lid

    # Пріоритет формулювань: спершу власні описи цього ж авто (там уже може лежати
    # білд-лист bimmer.work), далі решта проєкту, і лише потім англійський текст OEM.
    # Інакше опис опції щоразу перескакував би на формулювання випадкового іншого лота.
    path = CARS / f'{lid}.json' if lid else None
    data = json.loads(path.read_text()) if path and path.exists() else {'listingId': lid}
    own = {o['code']: o['desc'] for o in data.get('options', []) if o.get('desc')}
    built = build(parsed, {**corpus_descs(), **own})

    print(f"{built['vin']}  {parsed['fields'].get('Model', '')}  {built.get('prodDate', '')}")
    print(f"  фарба : {built['exterior']['name']} ({built['exterior']['code']})")
    print(f"  салон : {built['interior']['name']} ({built['interior']['code']})")
    print(f"  опцій : {len(built['options'])}")
    for key, title in (('retailer', 'дилер'), ('market', 'ринок'),
                       ('warrantyStart', 'гарантія з'), ('integrationLevel', 'ПЗ')):
        if built['oem'].get(key):
            print(f'  {title:6}: {built["oem"][key]}')
    note = odometer_note(built['oem'], listed_km)
    if note:
        print(f'  {note}')
    if why := bad_trim(built['interior']['name']):
        print(f'  ⛔ салон під виключення: {why} — рішення за користувачем')
    if blank := [o['code'] for o in built['options'] if not o['desc']]:
        print(f'  коди без опису (уточнити): {", ".join(blank)}')

    if not a.write:
        print('\n(показ без запису; --write щоб зберегти)')
        return 0
    if not lid:
        print('\nVIN не знайдено в індексі — вкажи --id <listingId>', file=sys.stderr)
        return 2

    was = data.get('decodeSource')
    # Кольори й дату випуску не перетираємо: у bimmer.work німецькі назви повніші
    # ('Arktikgrau Brillanteffekt Metallic' проти 'arktis-grau Brillanteffekt'),
    # а код фарби/оббивки в обох джерелах однаковий. Опції — навпаки, беремо з OEM:
    # там надмножина кодів, а формулювання й так тягнуться з corpus_descs().
    keep = [k for k in ('exterior', 'interior', 'prodDate') if data.get(k)]
    data.update({k: v for k, v in built.items() if k not in keep})
    src = f'oemnavigation.com/vin (share) {a.source.rsplit("/", 1)[-1]}'
    # Повторний запуск не має стирати попереднє джерело (було: перезаписувало на самий OEM).
    data['decodeSource'] = src if not was else was if src in was else f'{was} + {src}'
    with path.open('w') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f'\nзаписано → data/cars/{lid}.json   (далі: python3 tools/sync_index.py)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
