#!/usr/bin/env python3
"""Доглядач за добіркою Ford Ranger Wildtrak на Encar.

Що робить за один прохід:
  1. перевіряє кожне авто зі списку — продано / знято / змінилась ціна чи пробіг;
  2. шукає нові оголошення під критерії (Wildtrak, виготовлення 2022+, звичайний
     продаж) і додає їх з історією ДТП і звітом інспекції;
  3. якщо щось змінилось — пише data/last-change.md, комітить і пушить.

Комплектацію за VIN тут НЕ декодуємо — за рішенням користувача 2026-09-24 у
списку лише рік, пробіг, ціна в Кореї, кількість ДТП, зміни власника й ремонт.

Якщо прохід упав — падіння теж їде листом (див. `crash_report`). Інакше
поломка виглядає точно як «нових авто немає».

Лист приходить не звідси: push у data/last-change.md запускає
.github/workflows/notify.yml, який створює issue від github-actions[bot].

Запуск:  python3 tools/watch.py [--dry-run] [--no-publish]
"""
import argparse
import json
import pathlib
import subprocess
import sys
import traceback
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import encar
import inspection as inspect_report
import sync_index

REPO = pathlib.Path(__file__).resolve().parent.parent
INDEX = REPO / 'data' / 'cars.json'
CARS = REPO / 'data' / 'cars'
STATE = REPO / 'data' / 'watch-state.json'
LAST = REPO / 'data' / 'last-change.md'
LOG = REPO / 'data' / 'watch-log.md'

YEAR_FROM = 2022

SITE = 'https://volodymyr-babak.github.io/bmw-from-korea'

EMPTY_INDEX = {
    'meta': {
        'model': 'Ford Ranger Wildtrak',
        'criteria': 'Ranger Wildtrak · виготовлення 2022+ · звичайний продаж (без лізингу '
                    'й оренди) · без списання / потопу · дублі зведені за VIN',
        'updated': None, 'count': 0,
    },
    'cars': [],
}


def load(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def man(n):
    return f'{round(n):,}'.replace(',', ' ') + '만원'


def km(n):
    return f'{round(n or 0):,}'.replace(',', ' ') + ' км'


def krw_m(n):
    return f'{n / 1e6:.1f}'.replace('.', ',') + ' млн ₩'


def label(car):
    gen = f' · {car["gen"]} пок.' if car.get('gen') else ''
    return f'Ranger Wildtrak {car["year"]}{gen}'


def vehicle_id(det):
    """⚠️ vehicleId ≠ listingId у більшості лотів — брати з деталі."""
    return det.get('vehicleId') or (det.get('manage') or {}).get('dummyVehicleId')


# ---------------------------------------------------------------- 1. продані

def check_existing(index, ch):
    """Прибирає продані, оновлює ціну й пробіг живих, добирає VIN і звіт."""
    keep = []
    for car in index['cars']:
        lid = car['listingId']
        code, det = encar.detail(lid)
        if code == '404':
            ch['sold'].append((car, 'оголошення знято з Encar (API віддає 404)'))
            continue
        if code != '200' or not det:
            ch['problems'].append(f'{lid}: деталь недоступна (HTTP {code}) — лишаю у списку')
            keep.append(car)
            continue

        gone, why = encar.sale_state(det)
        if gone:
            ch['sold'].append((car, why))
            continue

        f = CARS / f'{lid}.json'
        d = load(f, {}) or {}

        # VIN в Encar то з'являється, то зникає — наявний ніколи не перетираємо None.
        vin = det.get('vin')
        if vin and not car.get('vin'):
            car['vin'] = vin
            d['vin'] = vin
            save(f, d)
            ch['vins'].append(car)

        vid = vehicle_id(det)
        # Звіт про стан видається один раз, тому тягнемо лише за відсутності.
        if f.exists() and 'inspection' not in d:
            got = fetch_inspection(vid, (det.get('spec') or {}).get('mileage'))
            if got:
                d['inspection'] = got
                d['inspectionFacts'] = [{'kind': k, 'text': t}
                                        for k, t in inspect_report.facts(got)]
                save(f, d)
                ch['inspected'].append((car, got))

        # Історія без масиву `accidents` — обрізана; добираємо один раз.
        if f.exists() and 'accidents' not in (d.get('history') or {}):
            _, full = encar.record(vid) if vid else ('skip', None)
            if full and 'accidents' in full:
                d['history'] = full
                save(f, d)

        ad, spec = det.get('advertisement') or {}, det.get('spec') or {}
        price, mileage = ad.get('price'), spec.get('mileage')
        if not price:
            keep.append(car)
            continue

        if price != car['koreaPriceMan'] or mileage != car['mileageKm']:
            ch['changed'].append((car, car['koreaPriceMan'], price, car['mileageKm'], mileage))
            car['koreaPriceMan'] = price
            d['koreaPriceMan'] = price
            if mileage:
                car['mileageKm'] = mileage
                d['mileageKm'] = mileage
            if f.exists():
                save(f, d)
        keep.append(car)

    index['cars'] = keep


def retire(car):
    f = CARS / f'{car["listingId"]}.json'
    if f.exists():
        f.unlink()


# ------------------------------------------------------------------ 2. нові

# Одне й те саме авто часто перевиставляють під новим listingId. Якщо VIN є —
# ловимо за ним. Encar же інколи VIN не показує, тому запасний критерій:
# той самий рік і та сама ціна в 만원 при пробігу, що зійшовся з точністю до
# TWIN_KM. Два різні авто з однаковою ціною й таким близьким пробігом —
# практично неможливо, а пропустити близнюка гірше, ніж показати його двічі.
TWIN_KM = 1000


def is_twin(cars, year, price, mileage):
    for c in cars:
        if (c['year'] == year and c.get('koreaPriceMan') == price
                and c.get('mileageKm') and mileage
                and abs(c['mileageKm'] - mileage) <= TWIN_KM):
            return c['listingId']
    return None


def reject_reason(det, hist, vins_taken, cars, year, price, insp=None):
    """Чому лот НЕ береться, або (None, vin). Критерії свідомо м'які:
    рік/комплектацію/тип продажу фільтрує сервер, а ДТП, ремонт і власників
    ми показуємо в таблиці, а не відсіюємо. Прибираємо лише те, що не
    розглядатиметься ніколи: списання, потоп, викрадення, дублі."""
    ad = det.get('advertisement') or {}
    if ad.get('salesStatus') or ad.get('price') == 9999:
        return 'уже продається за контрактом', None
    vin = det.get('vin')
    if vin and vin in vins_taken:
        return 'дубль за VIN', vin
    if not vin:
        twin = is_twin(cars, year, price, (det.get('spec') or {}).get('mileage'))
        if twin:
            return f'дубль без VIN — те саме авто, що лот {twin}', None
    if hist is None:
        return 'історія недоступна', vin
    if hist.get('totalLoss') or hist.get('flood') or hist.get('robber'):
        return 'списання / потоп / викрадення', vin
    if insp and (insp.get('serious') or insp.get('waterlog')):
        why = ', '.join(insp.get('serious') or []) or 'потоп'
        return f'звіт інспекції: {why}', vin
    return None, vin


def find_new(index, state, ch):
    known = {c['listingId'] for c in index['cars']}
    rejected = state.setdefault('rejected', {})
    vins_taken = {c['vin'] for c in index['cars'] if c.get('vin')}

    # дублі варто перепитати: близнюк міг продатись і місце звільнилось
    for lid in [k for k, v in rejected.items()
                if (v.get('reason') == 'дубль за VIN' and v.get('vin') not in vins_taken)
                or str(v.get('reason', '')).startswith('дубль без VIN')]:
        rejected.pop(lid)

    try:
        listings, _ = encar.search(YEAR_FROM)
    except RuntimeError as e:
        ch['problems'].append(f'пошук: {e}')
        return

    for x in listings:
        lid = str(x['Id'])
        if lid in known or lid in rejected:
            continue
        year = int(x['Year']) // 100
        if year < YEAR_FROM:
            continue
        price = x.get('Price')
        if not price:
            continue
        price = int(price)

        code, det = encar.detail(lid)
        if code != '200' or not det:
            ch['problems'].append(f'{lid}: новий лот, але деталь HTTP {code}')
            continue
        vid = vehicle_id(det)
        _, hist = encar.record(vid) if vid else ('404', None)
        insp = fetch_inspection(vid, (det.get('spec') or {}).get('mileage'))

        why, vin = reject_reason(det, hist, vins_taken, index['cars'], year, price, insp)
        if why:
            rejected[lid] = {'reason': why, 'vin': vin, 'at': today()}
            continue

        gen = encar.generation(x.get('Model'))
        car = build_car(lid, gen, year, price, det, hist, insp)
        index['cars'].append(car)
        known.add(lid)
        if vin:
            vins_taken.add(vin)
        save(CARS / f'{lid}.json', build_detail(lid, gen, year, price, det, hist, insp, x))
        ch['new'].append(car)


def fetch_inspection(vehicle_id_, mileage_ad=None):
    """Нормалізований звіт про стан або None, якщо Encar його не має."""
    if not vehicle_id_:
        return None
    code, payload = encar.inspection(vehicle_id_)
    if code != '200' or not payload:
        return None
    return inspect_report.normalise(payload, mileage_ad)


def build_car(lid, gen, year, price, det, hist, insp=None):
    spec = det.get('spec') or {}
    ph = encar.photos(det)
    car = {
        'listingId': lid, 'model': 'Ranger Wildtrak', 'gen': gen, 'year': year,
        'mileageKm': spec.get('mileage'), 'koreaPriceMan': price,
        'vin': det.get('vin'),
        'accident': {'costKRW': (hist or {}).get('myAccidentCost') or 0,
                     'owners': (hist or {}).get('ownerChangeCnt') or 0,
                     'incidents': sync_index.incidents(hist or {})},
        'photo': (ph['outer'] or ph['inner'] or [None])[0],
    }
    # Прапорці зі звіту показуються прямо в списку — прокат і ДТП каркаса
    # надто важливі, щоб чекати, поки хтось відкриє картку.
    flags = list((insp or {}).get('usage') or []) + list((insp or {}).get('serious') or [])
    if (insp or {}).get('accident'):
        flags.append('ДТП каркаса')
    if flags:
        car['flags'] = flags
    return car


def build_detail(lid, gen, year, price, det, hist, insp=None, listing=None):
    # Сирий текст оголошення зберігаємо: там буває те, чого немає в API
    # (ключі, протектор, гарантія, визнані кузовні роботи).
    text = (det.get('contents') or {}).get('text') or ''
    spec = det.get('spec') or {}
    return {
        'listingId': lid,
        'encarUrl': f'https://fem.encar.com/cars/detail/{lid}',
        'model': 'Ranger Wildtrak', 'gen': gen, 'mfgYear': year,
        'encarModel': (listing or {}).get('Model'),
        'formYear': (listing or {}).get('FormYear'),
        'vin': det.get('vin'),
        'mileageKm': spec.get('mileage'),
        'koreaPriceMan': price,
        'colorName': spec.get('colorName'),
        'photos': encar.photos(det),
        'history': hist,
        **({'sellerText': text} if text.strip() else {}),
        **({'inspection': insp} if insp else {}),
        **({'inspectionFacts': [{'kind': k, 'text': t}
                                for k, t in inspect_report.facts(insp)]} if insp else {}),
    }


# ------------------------------------------------------------------- 3. звіт

def today():
    return datetime.now().strftime('%Y-%m-%d')


def car_link(car):
    return (f'[лот {car["listingId"]}]({SITE}/car.html?id={car["listingId"]}) '
            f'· [Encar](https://fem.encar.com/cars/detail/{car["listingId"]})')


def report(ch):
    n = {k: len(v) for k, v in ch.items()}
    head = []
    if n['sold']:
        head.append(f'продано {n["sold"]}')
    if n['new']:
        head.append(f'нових {n["new"]}')
    if n['changed']:
        head.append(f'зміна ціни {n["changed"]}')
    if n['vins']:
        head.append(f'з\'явився VIN {n["vins"]}')
    if n['inspected']:
        head.append(f'звітів про стан {n["inspected"]}')
    if not head and n['problems']:
        head.append(f'проблем {n["problems"]}')
    title = 'Encar: ' + ' · '.join(head) if head else 'Encar: без змін'

    out = [f'# {title}', '']
    if ch['sold']:
        out += ['## Прибрано зі списку', '']
        for car, why in ch['sold']:
            out.append(f'- **{label(car)}** · {km(car["mileageKm"])} '
                       f'· було {man(car["koreaPriceMan"])} — {why}  \n  {car_link(car)}')
        out.append('')
    if ch['new']:
        out += ['## Нові кандидати', '']
        for car in ch['new']:
            acc = car.get('accident') or {}
            hist = ('без ремонтів' if not acc.get('costKRW')
                    else f'ремонт {krw_m(acc["costKRW"])}')
            inc = acc.get('incidents')
            inc_s = 'ДТП —' if inc is None else f'ДТП {inc}'
            flags = f' · ⚠ {", ".join(car["flags"])}' if car.get('flags') else ''
            out.append(f'- **{label(car)}** · {km(car["mileageKm"])} '
                       f'· {man(car["koreaPriceMan"])} · {inc_s} · {hist} '
                       f'· змін власника {acc.get("owners", 0)}{flags}  \n  {car_link(car)}')
        out.append('')
    if ch['vins']:
        out += ['## З\'явився VIN', '']
        for car in ch['vins']:
            out.append(f'- **{label(car)}** · VIN `{car["vin"]}`  \n  {car_link(car)}')
        out.append('')
    if ch['inspected']:
        out += ['## Додано звіт про стан', '']
        for car, insp in ch['inspected']:
            bits = list(insp.get('usage') or []) + list(insp.get('serious') or [])
            if insp.get('accident'):
                bits.append('ДТП каркаса')
            bits += [f"{p['part']} — {p['status']}" for p in insp.get('panels') or []]
            out.append(f'- **{label(car)}** · {man(car["koreaPriceMan"])} — '
                       f'{", ".join(bits) if bits else "звіт чистий"}  \n  {car_link(car)}')
        out.append('')
    if ch['changed']:
        out += ['## Змінилась ціна або пробіг', '']
        for car, old_p, new_p, old_km, new_km in ch['changed']:
            bits = []
            if old_p != new_p:
                bits.append(f'{man(old_p)} → **{man(new_p)}**')
            if old_km != new_km:
                bits.append(f'{km(old_km)} → {km(new_km)}')
            out.append(f'- **{label(car)}** · {" · ".join(bits)}  \n  {car_link(car)}')
        out.append('')
    if ch['notes']:
        out += ['## Примітки', ''] + [f'- {t}' for t in ch['notes']] + ['']
    if ch['problems']:
        out += ['## Потрібна увага', ''] + [f'- {t}' for t in ch['problems']] + ['']
    out.append(f'Список: {SITE}/  ·  перевірено {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    return title, '\n'.join(out)


def git(*args, check=True):
    return subprocess.run(['git', '-C', str(REPO), *args],
                          capture_output=True, text=True, check=check)


def publish(title, paths=('data',)):
    git('add', *paths)
    if not git('diff', '--cached', '--quiet', check=False).returncode:
        return 'нічого комітити'
    git('commit', '-m', f'chore: {title}\n\nАвтоматично — tools/watch.py')
    r = git('push', 'origin', 'HEAD', check=False)
    if r.returncode:
        git('pull', '--rebase', '--autostash', 'origin', 'main', check=False)
        r = git('push', 'origin', 'HEAD', check=False)
    return 'запушено' if r.returncode == 0 else f'push не вдався: {r.stderr.strip()[:200]}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='нічого не писати й не пушити')
    ap.add_argument('--no-publish', action='store_true',
                    help='записати дані, але не комітити й не пушити')
    a = ap.parse_args()

    index = load(INDEX, None) or EMPTY_INDEX
    state = load(STATE, {})
    ch = {'sold': [], 'new': [], 'changed': [], 'vins': [],
          'inspected': [], 'problems': [], 'notes': []}

    CARS.mkdir(exist_ok=True)
    check_existing(index, ch)
    find_new(index, state, ch)

    index['cars'].sort(key=lambda c: (c['koreaPriceMan'], c['listingId']))
    for i, c in enumerate(index['cars'], 1):
        c['rank'] = i
    index['meta']['updated'] = today()
    index['meta']['count'] = len(index['cars'])
    state['lastRun'] = datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')

    title, body = report(ch)
    touched = any(ch[k] for k in ('sold', 'new', 'changed'))

    if a.dry_run:
        print(body)
        print(f'\n[dry-run] змін: {touched}')
        return

    for car, _ in ch['sold']:
        retire(car)
    save(INDEX, index)
    save(STATE, state)
    sync_index.main()

    if touched or ch['problems']:
        if same_as_last(body):
            # Однаковий звіт = та сама невирішена проблема; не спамимо щогодини.
            print('звіт не змінився з минулого разу — не публікую')
        else:
            save_md(LAST, body)
            append_md(LOG, body)
            if a.no_publish:
                print('[no-publish] звіт записано, коміту немає')
            else:
                print(publish(title))
    print(title)


def strip_stamp(body: str) -> str:
    return '\n'.join(body.rstrip().split('\n')[:-1]).rstrip()


def same_as_last(body: str) -> bool:
    if not LAST.exists():
        return False
    return strip_stamp(LAST.read_text(encoding='utf-8')) == strip_stamp(body)


def save_md(path, body):
    path.write_text(body + '\n', encoding='utf-8')


def append_md(path, body):
    with path.open('a', encoding='utf-8') as f:
        f.write('\n---\n\n' + body + '\n')


def blind_since() -> str:
    stamp = (load(STATE, {}) or {}).get('lastRun')
    if not stamp:
        return 'невідомо, коли прохід вдавався останній раз'
    try:
        was = datetime.fromisoformat(stamp)
    except ValueError:
        return f'останній успішний прохід: {stamp}'
    hours = (datetime.now(timezone.utc) - was.astimezone(timezone.utc)).total_seconds() / 3600
    return f'останній успішний прохід — {stamp} ({hours:.0f} год тому)'


def crash_report(exc: Exception):
    """Падіння мусить приїхати листом — інакше воно нічим не відрізняється
    від «на Encar нічого нового»."""
    title = f'⛔ watch.py упав: {type(exc).__name__}'
    tail = traceback.format_exc().strip().split('\n')[-24:]
    return title, '\n'.join([
        f'# {title}', '',
        '**Прохід не дійшов до кінця — списку цього разу НЕ перевірено.**', '',
        f'Причина: `{exc}`', '',
        f'Тривога: {blind_since()}.', '',
        '## Трейсбек', '', '```', *tail, '```', '',
        'Лог усіх проходів: `~/.cache/bmw-watch.log` на машині з кроном.',
        f'Список: {SITE}/  ·  упало {datetime.now().strftime("%Y-%m-%d %H:%M")}',
    ])


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — падіння мусить долетіти листом
        title, body = crash_report(exc)
        print(body, file=sys.stderr)
        if '--dry-run' in sys.argv or '--no-publish' in sys.argv:
            pass
        elif same_as_last(body):
            print('той самий трейсбек, що минулого разу — не публікую', file=sys.stderr)
        else:
            try:
                save_md(LAST, body)
                append_md(LOG, body)
                print(publish(title, ('data/last-change.md', 'data/watch-log.md')),
                      file=sys.stderr)
            except Exception as pub:  # noqa: BLE001
                print(f'звіт про падіння не опублікувався: {pub}', file=sys.stderr)
        raise
