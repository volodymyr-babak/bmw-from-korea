#!/usr/bin/env python3
"""Платний декодер VIN outvin.com (професійний сервіс від авторів mdecoder).

⚠️⚠️ КОЖЕН ЗАПИТ КОШТУЄ ГРОШЕЙ. Пакет передплачений і невеликий.
Тому тут три запобіжники:
  1. Сирі відповіді кешуються в `data/outvin-raw/<VIN>.json`; якщо файл є —
     повторного запиту НЕ буде ніколи.
  2. CLI без `--yes` нічого не запитує, лише показує, що зробив би.
  3. `/status` НЕ смикаємо взагалі: перевірено 2026-09-03 — він, схоже,
     теж списує кредит (у «Request history» його не видно, але залишок
     зменшився на 1 понад єдиний декод). Невірний логін і так видно
     по 401 на самому декоді.

Доступ — HTTP Basic, email+пароль акаунта, ЛИШЕ з оточення:

    OUTVIN_AUTH='email:пароль' python3 tools/outvin.py WBACV6108L9B00346 --yes

У репозиторій пароль не потрапляє.

Формат відповіді: `{available_requests, data.vehicle.stream_map}`, де кожен
запис — `{translation, stream_result}`. Коди йдуть із префіксом джерела:
`s0710` (Sonderausstattung) → наш `S710`, `sa090` → `SA090`,
`l0a96` (Lack/фарба) → `A96`, `pmcsw` (Polster/оббивка) → `MCSW`.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bimmer import bad_trim, corpus_descs, paint, trim  # noqa: E402
from mdecoder import key_features  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'cars.json'
CARS = ROOT / 'data' / 'cars'
RAW = ROOT / 'data' / 'outvin-raw'

API = 'https://www.outvin.com/api/v1/vehicle/{vin}'
SOURCE = 'outvin.com API'


class OutvinError(RuntimeError):
    pass


def _norm(code: str) -> str:
    """Зняти префікс джерела: 'l0a96' → 'A96', 'pmcsw' → 'MCSW', 's0710' → '710'.

    Перший знак — звідки код (s = Sonderausstattung, l = Lack/фарба,
    p = Polster/оббивка), далі 4-значний код BMW, у якого провідний нуль
    у нашому форматі не пишеться. Для ОПЦІЙ поверх цього треба ще 'S' —
    див. `_opt()`; фарба й оббивка в нас без префікса.
    """
    rest = (code or '')[1:].upper()
    return rest[1:] if rest.startswith('0') else rest


def _opt(code: str) -> str:
    """'s0710' → 'S710', 'sa090' → 'SA090' — формат опцій у наших даних."""
    return 'S' + _norm(code)


def _one(entry) -> dict | None:
    """stream_result у полів-довідників — це {id: {...}}; беремо єдиний запис."""
    res = (entry or {}).get('stream_result')
    if isinstance(res, dict) and res:
        return next(iter(res.values()))
    return None


def fetch(vin: str, auth: str, cache: bool = True) -> dict:
    """Один платний запит. Якщо VIN уже в кеші — запиту НЕ буде."""
    path = RAW / f'{vin}.json'
    if cache and path.exists() and path.stat().st_size:
        return json.loads(path.read_text())
    r = subprocess.run(
        ['curl', '-sS', '--max-time', '90', '-w', '\n%{http_code}',
         '-u', auth, API.format(vin=vin)],
        capture_output=True, text=True)
    body, _, code = r.stdout.rpartition('\n')
    code = code.strip()
    if code == '401':
        raise OutvinError('401 — логін/пароль не підійшли')
    if code == '402':
        raise OutvinError('402 — кредити скінчились')
    if code == '404':
        raise OutvinError('404 — VIN не знайдено')
    if code != '200':
        raise OutvinError(f'HTTP {code}')
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise OutvinError('відповідь не JSON')
    RAW.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
    return data


def build(payload: dict, descs: dict) -> dict:
    sm = payload['data']['vehicle']['stream_map']
    opts_raw = (sm.get('options') or {}).get('stream_result') or {}
    codes = sorted({_opt(e['code']) for e in opts_raw.values() if e.get('code')})
    by_code = {_opt(e['code']): (e.get('description') or '').strip()
               for e in opts_raw.values() if e.get('code')}
    opts = [{'code': c, 'desc': descs.get(c) or by_code.get(c, '')} for c in codes]

    colour, seats, engine = _one(sm.get('color_code')), _one(sm.get('interior_code')), _one(sm.get('engine_code'))
    eng = (engine or {}).get('description') or None
    power = {'B57O': '195 кВт / 265 к.с. · 620 Нм',
             'B57P': '210 кВт / 286 к.с. · 650 Нм'}.get(eng)
    note = ('48V mild-hybrid (S1CE) — версія 210 кВт / 286 к.с., потужніша за '
            'B57D30O0 (195 кВт / 265 к.с.).' if 'S1CE' in codes else
            'Без 48V — 195 кВт / 265 к.с. Доліфтова версія двигуна; '
            'на модельних 2021+ (з mild-hybrid) 210 кВт / 286 к.с.')

    out = {
        'prodDate': (sm.get('production_date') or {}).get('stream_result') or None,
        'engine': eng,
        'power': power,
        'engineNote': note,
        'exterior': paint(f'{colour["description"]} ({_norm(colour["code"])})') if colour else None,
        'interior': trim(f'{seats["description"]} ({_norm(seats["code"])})') if seats else None,
        'options': opts,
        'keyFeatures': key_features([(o['code'], o['desc']) for o in opts]),
        'decodeSource': SOURCE,
    }
    return {k: v for k, v in out.items() if v}


def apply(vin: str, payload: dict, listing_id: str | None = None) -> tuple[str | None, dict]:
    """Записати білд-лист у data/cars/<id>.json. Повертає (listingId, built)."""
    index = json.loads(INDEX.read_text())
    lid = listing_id or next((c['listingId'] for c in index['cars'] if c.get('vin') == vin), None)
    built = build(payload, corpus_descs())
    if not lid:
        return None, built
    path = CARS / f'{lid}.json'
    data = json.loads(path.read_text()) if path.exists() else {'listingId': lid, 'vin': vin}
    was = data.get('decodeSource')
    data.update(built)
    data['decodeSource'] = SOURCE if not was or SOURCE in was else f'{was} + {SOURCE}'
    with path.open('w') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    return lid, built


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('vin')
    ap.add_argument('--yes', action='store_true',
                    help='ПІДТВЕРДИТИ платний запит (без цього — лише показ)')
    ap.add_argument('--id', help='listingId, якщо VIN ще не в індексі')
    a = ap.parse_args(argv)
    vin = a.vin.upper()

    cached = (RAW / f'{vin}.json').exists()
    if not cached and not a.yes:
        print(f'{vin}: у кеші немає, запит ПЛАТНИЙ. Додай --yes, щоб витратити кредит.')
        return 1
    auth = os.environ.get('OUTVIN_AUTH')
    if not cached and not auth:
        print('немає OUTVIN_AUTH у оточенні (формат email:пароль)', file=sys.stderr)
        return 2
    try:
        payload = fetch(vin, auth or '')
    except OutvinError as e:
        print(f'{vin}: {e}', file=sys.stderr)
        return 3

    lid, built = apply(vin, payload, a.id)
    print(f'{vin}  {"(з кешу)" if cached else "запит витрачено"}  '
          f'залишок: {payload.get("available_requests", "?")}')
    print(f'  фарба : {built["exterior"]["name"]} ({built["exterior"]["code"]})')
    print(f'  салон : {built["interior"]["name"]} ({built["interior"]["code"]})')
    print(f'  опцій : {len(built["options"])} · випуск {built.get("prodDate")} · {built.get("engine")}')
    if why := bad_trim(built['interior']['name']):
        print(f'  ⛔ салон під виключення: {why} — рішення за користувачем')
    if blank := [o['code'] for o in built['options'] if not o['desc']]:
        print(f'  коди без опису: {", ".join(blank)}')
    print(f'  → data/cars/{lid}.json' if lid else '  VIN не в індексі — не записано (--id)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
