#!/usr/bin/env python3
"""Щогодинний доглядач за добіркою на Encar.

Що робить за один прохід:
  1. перевіряє кожне авто зі списку — продано / знято / змінилась ціна;
  2. шукає нові оголошення під критерії й додає ті, що пройшли історію ДТП;
  3. пробує декодувати VIN найперспективніших авто через mdecoder;
  4. якщо щось змінилось — пише data/last-change.md, комітить і пушить.

Лист приходить не звідси: push у data/last-change.md запускає
.github/workflows/notify.yml, який створює issue від github-actions[bot].
Автор issue — бот, а не ти, тому GitHub надсилає тобі листа (про власні дії
він листів не надсилає).

Запуск:  python3 tools/watch.py [--dry-run] [--no-decode] [--decode N]
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import customs
import encar
import mdecoder
import outvin
import trim
import seller
import inspection as inspect_report
import sync_index

REPO = pathlib.Path(__file__).resolve().parent.parent
INDEX = REPO / 'data' / 'cars.json'
CARS = REPO / 'data' / 'cars'
SOLD = REPO / 'data' / 'sold'
RAW = REPO / 'data' / 'mdecoder-raw'
STATE = REPO / 'data' / 'watch-state.json'
LAST = REPO / 'data' / 'last-change.md'
LOG = REPO / 'data' / 'watch-log.md'

YEAR_FROM, YEAR_TO = 2019, 2022
MAX_KM = 110_000
MAX_ACCIDENT_KRW = 5_000_000
DECODE_PER_RUN = 3
# ⚠️ Платний фолбек: КОЖЕН запит коштує грошей, пакет невеликий.
# Тому строго один VIN за прохід і лише коли безкоштовний mdecoder не дав нічого.
OUTVIN_PER_RUN = 1

SITE = 'https://volodymyr-babak.github.io/bmw-from-korea'


def load(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def usd(n):
    return '$' + f'{round(n):,}'.replace(',', ' ')


def km(n):
    return f'{round(n):,}'.replace(',', ' ') + ' км'


def krw_m(n):
    return f'{n / 1e6:.1f}'.replace('.', ',') + ' млн ₩'


def short(model):
    return 'X5' if model.startswith('X5') else 'X6'


# ---------------------------------------------------------------- 1. продані

def check_existing(index, ch):
    """Прибирає продані, оновлює ціну й пробіг живих."""
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

        # VIN в Encar то з'являється, то зникає. Якщо його ще не було —
        # забираємо: без VIN авто неможливо декодувати й перевірити салон.
        # Наявний VIN ніколи не перетираємо значенням None.
        vin = det.get('vin') or seller.vin_from_text(
            (det.get('contents') or {}).get('text') or '', car['year'])
        if vin and not car.get('vin'):
            car['vin'] = vin
            f = CARS / f'{lid}.json'
            if f.exists():
                d = load(f, {}) or {}
                d['vin'] = vin
                save(f, d)
            ch['vins'].append(car)

        # Звіт про стан видається один раз, тому тягнемо лише за відсутності —
        # щогодини перепитувати 45 разів немає сенсу.
        f = CARS / f'{lid}.json'
        d = load(f, {}) or {}
        if f.exists() and 'inspection' not in d:
            vid = det.get('vehicleId') or (det.get('manage') or {}).get('dummyVehicleId')
            got = fetch_inspection(vid, (det.get('spec') or {}).get('mileage'))
            if got:
                d['inspection'] = got
                d['inspectionFacts'] = [{'kind': k, 'text': t}
                                        for k, t in inspect_report.facts(got)]
                save(f, d)
                ch['inspected'].append((car, got))

        # Старі записи зберігали історію обрізаною (8 полів, без `accidents`),
        # а саме масив із датами дає число УНІКАЛЬНИХ ДТП. Добираємо один раз:
        # щойно повна історія на місці, запит більше не робиться.
        if f.exists() and 'accidents' not in (d.get('history') or {}):
            vid = det.get('vehicleId') or (det.get('manage') or {}).get('dummyVehicleId')
            code_h, full = encar.record(vid) if vid else ('skip', None)
            if full and 'accidents' in full:
                d['history'] = full
                save(f, d)

        ad, spec = det.get('advertisement') or {}, det.get('spec') or {}
        man, mileage = ad.get('price'), spec.get('mileage')
        if not man:
            keep.append(car)
            continue

        new_price = customs.landed(car['year'], man)
        if new_price > customs.BUDGET_CAP:
            ch['sold'].append((car, f'ціна зросла до {man}만 = {usd(new_price)} — вже понад стелю'))
            continue

        if new_price != car['priceUSD'] or mileage != car['mileageKm']:
            ch['changed'].append((car, car['priceUSD'], new_price, car['mileageKm'], mileage))
        car['koreaPriceMan'] = man
        car['priceUSD'] = new_price
        if mileage:
            car['mileageKm'] = mileage
        keep.append(car)

    index['cars'] = keep


def retire(car):
    """Прибрати авто зі списку: білд-лист — в архів, решту — видалити."""
    f = CARS / f'{car["listingId"]}.json'
    if not f.exists():
        return
    if (load(f, {}) or {}).get('options'):
        SOLD.mkdir(exist_ok=True)
        shutil.move(str(f), str(SOLD / f.name))
    else:
        f.unlink()


# ------------------------------------------------------------------ 2. нові

# Одне й те саме авто часто перевиставляють під новим listingId. Якщо VIN є —
# ловимо за ним. Encar же інколи VIN не показує, тому запасний критерій:
# той самий рік і та сама ціна в 만원 при пробігу, що зійшовся з точністю до
# TWIN_KM. Два різні авто з однаковою ціною й таким близьким пробігом —
# практично неможливо, а пропустити близнюка гірше, ніж показати його двічі.
TWIN_KM = 1000


def is_twin(cars, model, year, man, mileage):
    for c in cars:
        if (c['model'] == model and c['year'] == year
                and c.get('koreaPriceMan') == man
                and c.get('mileageKm') and mileage
                and abs(c['mileageKm'] - mileage) <= TWIN_KM):
            return c['listingId']
    return None


# Прокат/таксі/комерційне минуле — стоп-фактор із 2026-09-02: в Україні воно
# помітно б'є по ліквідності при перепродажі. Видно лише у звіті інспекції
# (`usageChangeTypes`), в оголошенні й у решті API цього немає.
BAD_USAGE = ('прокат', 'таксі', 'комерційне')


def reject_reason(det, hist, vins_taken, cars, model, year, man, bad_trim=None,
                  insp=None, bad_usage_vins=None, bad_light=None):
    kw_inspection = {'insp': insp}
    ad = det.get('advertisement') or {}
    if ad.get('salesStatus') or ad.get('price') == 9999:
        return 'уже продається за контрактом', None
    vin = det.get('vin')
    if vin and vin in vins_taken:
        return 'дубль за VIN', vin
    # Tacora Red і Ivory White видно на фото одразу — відсіюємо, не витрачаючи
    # на це дефіцитну спробу mdecoder. Ключ — VIN, бо той самий лот
    # перевиставляють під новим listingId, а колір оббивки не змінюється.
    # Cognac від кавового по фото надійно не відрізниш — ці лишаємо до VIN.
    if vin and vin in (bad_trim or {}):
        return f'салон {bad_trim[vin]} за фото', vin
    # Запасний шлях: якщо звіту інспекції немає, ловимо за VIN — той самий лот
    # перевиставляють під новим listingId, а минуле авто не змінюється.
    if vin and vin in (bad_usage_vins or {}):
        return f'було в статусі «{bad_usage_vins[vin]}»', vin
    if vin and vin in (bad_light or {}):
        return 'базові фари — без адаптиву/лазера', vin
    # Кольору салону в API немає, але продавці пишуть його в описі — і опис
    # збігається з білд-листом там, де є обидва. Відсіваємо тут, до mdecoder.
    colour, ok, _ = trim.seat_colour(((det.get('contents') or {}).get('text') or ''))
    if colour and not ok:
        return f'салон {colour} за описом продавця', vin
    if not vin:
        twin = is_twin(cars, model, year, man, (det.get('spec') or {}).get('mileage'))
        if twin:
            return f'дубль без VIN — те саме авто, що лот {twin}', None
    if hist is None:
        return 'історія недоступна', vin
    if hist.get('totalLoss') or hist.get('flood') or hist.get('robber'):
        return 'списання / потоп / викрадення', vin
    # Той самий запобіжник із другого джерела: державний звіт про стан.
    # `record` API інколи ще не має того, що інспекція вже зафіксувала.
    insp = kw_inspection.get('insp')
    if insp and (insp.get('serious') or insp.get('waterlog')):
        why = ', '.join(insp.get('serious') or []) or 'потоп'
        return f'звіт інспекції: {why}', vin
    used = [u for u in (insp or {}).get('usage') or [] if u in BAD_USAGE]
    if used:
        return f'звіт інспекції: було в статусі «{", ".join(used)}»', vin
    cost = hist.get('myAccidentCost') or 0
    if cost > MAX_ACCIDENT_KRW:
        return f'власний ремонт {krw_m(cost)}', vin
    return None, vin


def find_new(index, state, ch):
    known = {c['listingId'] for c in index['cars']}
    rejected = state.setdefault('rejected', {})
    vins_taken = {c['vin'] for c in index['cars'] if c.get('vin')}
    bad_trim = state.get('interiorRejected') or {}
    bad_usage_vins = state.get('usageRejected') or {}
    bad_light = state.get('lightRejected') or {}

    # дублі варто перепитати: близнюк міг продатись і місце звільнилось
    for lid in [k for k, v in rejected.items()
                if (v.get('reason') == 'дубль за VIN' and v.get('vin') not in vins_taken)
                or str(v.get('reason', '')).startswith('дубль без VIN')]:
        rejected.pop(lid)

    for model in encar.MODELS:
        try:
            listings, _ = encar.search(model, YEAR_FROM, YEAR_TO, MAX_KM,
                                       customs.SEARCH_PRICE_CAP_MAN)
        except RuntimeError as e:
            ch['problems'].append(f'пошук {model}: {e}')
            continue

        for x in listings:
            lid = str(x['Id'])
            if lid in known or lid in rejected:
                continue
            year = int(x['Year']) // 100
            if not (YEAR_FROM <= year <= YEAR_TO):
                continue
            man = x.get('Price')
            if not man:
                continue
            price = customs.landed(year, int(man))
            if price > customs.BUDGET_CAP:
                continue

            code, det = encar.detail(lid)
            if code != '200' or not det:
                ch['problems'].append(f'{lid}: новий лот, але деталь HTTP {code}')
                continue
            vid = det.get('vehicleId') or (det.get('manage') or {}).get('dummyVehicleId')
            _, hist = encar.record(vid) if vid else ('404', None)
            insp = fetch_inspection(vid, (det.get('spec') or {}).get('mileage'))

            why, vin = reject_reason(det, hist, vins_taken, index['cars'],
                                     model, year, int(man), bad_trim, insp,
                                     bad_usage_vins, bad_light)
            if why:
                rejected[lid] = {'reason': why, 'vin': vin, 'at': today()}
                continue

            car = build_car(lid, model, year, int(man), price, det, hist, insp)
            index['cars'].append(car)
            known.add(lid)
            if vin:
                vins_taken.add(vin)
            save(CARS / f'{lid}.json',
                 build_detail(lid, model, year, int(man), price, det, hist, insp))
            ch['new'].append(car)


def fetch_inspection(vehicle_id, mileage_ad=None):
    """Нормалізований звіт про стан або None, якщо Encar його не має."""
    if not vehicle_id:
        return None
    code, payload = encar.inspection(vehicle_id)
    if code != '200' or not payload:
        return None
    return inspect_report.normalise(payload, mileage_ad)


def build_car(lid, model, year, man, price, det, hist, insp=None):
    spec = det.get('spec') or {}
    ph = encar.photos(det)
    car = {
        'listingId': lid, 'model': model, 'year': year,
        'mileageKm': spec.get('mileage'), 'koreaPriceMan': man, 'priceUSD': price,
        'vin': det.get('vin') or seller.vin_from_text(
            (det.get('contents') or {}).get('text') or '', year),
        'decoded': False,
        'accident': {'costKRW': (hist or {}).get('myAccidentCost') or 0,
                     'owners': (hist or {}).get('ownerChangeCnt') or 0},
        'photo': (ph['outer'] or ph['inner'] or [None])[0],
    }
    if not model.startswith('X5'):
        car['priceEstimated'] = True
    lab = exterior_label(spec.get('colorName'), spec.get('customColor'))
    if lab:
        car['exterior'] = lab
    # Салон зі слів продавця: краще, ніж нічого, поки не знято білд-лист.
    colour, ok, _ = trim.seat_colour(((det.get('contents') or {}).get('text') or ''))
    if colour and ok:
        car['interiorUnverified'] = f'{colour} — з опису'
    # Прапорці зі звіту показуються прямо в списку — прокат і ДТП каркаса
    # надто важливі, щоб чекати, поки хтось відкриє картку.
    flags = list((insp or {}).get('usage') or []) + list((insp or {}).get('serious') or [])
    if (insp or {}).get('accident'):
        flags.append('ДТП каркаса')
    if flags:
        car['flags'] = flags
    return car


def build_detail(lid, model, year, man, price, det, hist, insp=None):
    # Сирий текст оголошення зберігаємо назавжди: у ньому лежить те, чого немає
    # в API (ключі, протектор, продовжена гарантія, визнані кузовні роботи), і
    # перечитати його руками можна вже без запитів до Encar.
    text = (det.get('contents') or {}).get('text') or ''
    auto = seller.facts(text)
    return {
        'listingId': lid,
        'encarUrl': f'https://fem.encar.com/cars/detail/{lid}',
        'model': model, 'mfgYear': year,
        'vin': det.get('vin') or seller.vin_from_text(text, year),
        'mileageKm': (det.get('spec') or {}).get('mileage'),
        'koreaPriceMan': man, 'priceUSD': price,
        **({'priceEstimated': True} if not model.startswith('X5') else {}),
        'photos': encar.photos(det),
        'history': hist,
        **({'sellerText': text} if text.strip() else {}),
        **({'sellerFacts': auto} if auto else {}),
        **({'inspection': insp} if insp else {}),
        **({'inspectionFacts': [{'kind': k, 'text': t}
                                for k, t in inspect_report.facts(insp)]} if insp else {}),
    }


KO_COLOR = {'흰색': 'білий', '검정색': 'чорний', '청색': 'синій', '쥐색': 'сірий',
            '진주색': 'перловий', '은색': 'срібний', '회색': 'сірий', '갈색': 'коричневий',
            '남색': 'темно-синій', '하늘색': 'небесно-блакитний', '연금색': 'бронзовий'}
KO_CUSTOM = {'카본블랙': 'Carbon Black', '카본 블랙': 'Carbon Black', '416': 'Carbon Black',
             '아크틱그레이': 'Arctic Grey', '네이비': 'Navy',
             '맨하탄': 'Manhattan', '미네랄화이트': 'Mineral White',
             '미네랄 화이트': 'Mineral White', '피토닉블루': 'Phytonic Blue'}


def exterior_label(color_name, custom):
    if custom and KO_CUSTOM.get(custom.strip()):
        return KO_CUSTOM[custom.strip()]
    return KO_COLOR.get(color_name, color_name)


# ------------------------------------------------------------- 3. декодування

def promise(car):
    """Чим менше, тим цікавіше декодувати: ціна, пробіг, ДТП, власники, вік."""
    acc = car.get('accident') or {}
    return (car['priceUSD'] / 1000
            + (car.get('mileageKm') or 0) / 10000
            + (acc.get('costKRW') or 0) / 1e6
            + (acc.get('owners') or 0) * 0.5
            - (car['year'] - YEAR_FROM) * 1.5)


def decode_batch(index, state, ch, limit):
    md = state.setdefault('mdecoder', {'quotaExhaustedOn': None, 'decoded': {}, 'failed': {}})
    # Раніше тут стояв добовий локдаун: побачили ліміт — і до кінця доби не пробували.
    # Це помилка, бо ліміт mdecoder рахується ПО IP, а egress у нас спільна
    # (91.225.165.251; звідти ж Encar періодично віддає 407, а bimmer.work — 429).
    # Тобто квоту з'їдають інші користувачі тієї самої адреси, і вікно, коли вона
    # вільна, ловиться лише спробою. Тому пробуємо ЩОПРОХОДУ, а `quotaExhaustedOn`
    # лишається просто відміткою «коли востаннє бачили ліміт».
    if limit <= 0:
        return

    todo = sorted(
        (c for c in index['cars']
         if not c.get('decoded') and c.get('vin') and c['vin'] not in md['failed']),
        key=promise)
    if not todo:
        return

    for car in todo[:limit]:
        res = mdecoder.decode(car['vin'])
        if res.status == 'quota':
            md['quotaExhaustedOn'] = today()
            md['quotaSeenAt'] = datetime.now().strftime('%Y-%m-%d %H:%M')
            ch['notes'].append('mdecoder: ліміт на IP зайнятий — спробую знову наступного проходу')
            break
        if res.status in ('http', 'shell'):
            ch['problems'].append(f'{car["listingId"]}: mdecoder — {res.note}')
            continue
        if res.status == 'unparsed':
            path = keep_raw(res)
            md['failed'][car['vin']] = {'reason': res.note, 'raw': str(path), 'at': today()}
            ch['problems'].append(
                f'{car["listingId"]}: mdecoder відповів, але розмітка не збіглась '
                f'({res.note}). Сирий HTML: `{path.relative_to(REPO)}` — треба доробити парсер')
            continue

        apply_decode(car, res, ch)
        md['decoded'][car['vin']] = today()
        if res.status == 'partial':
            path = keep_raw(res)
            ch['problems'].append(
                f'{car["listingId"]}: опції зчитано, але {res.note}. '
                f'Сирий HTML: `{path.relative_to(REPO)}`')

    # Другий варіант — платний outvin.com, і тільки для того, що mdecoder не подужав.
    left = [c for c in todo if not c.get('decoded')]
    for car in left[:OUTVIN_PER_RUN]:
        outvin_try(car, state, ch)


def outvin_try(car, state, ch) -> bool:
    """Один ПЛАТНИЙ декод. Кредити рахуємо в стані, щоб не палити їх наосліп."""
    ov = state.setdefault('outvin', {'available': None, 'decoded': {}, 'failed': {}})
    auth = os.environ.get('OUTVIN_AUTH')
    if not auth:
        ch['notes'].append('outvin: OUTVIN_AUTH не заданий — платний фолбек вимкнено')
        return False
    if ov.get('available') == 0:
        ch['notes'].append('outvin: кредити скінчились')
        return False
    vin = car['vin']
    if vin in ov['failed'] or vin in ov['decoded']:
        return False
    try:
        payload = outvin.fetch(vin, auth)
    except outvin.OutvinError as e:
        ov['failed'][vin] = {'reason': str(e), 'at': today()}
        ch['problems'].append(f'{car["listingId"]}: outvin — {e}')
        return False

    ov['available'] = payload.get('available_requests')
    ov['decoded'][vin] = today()
    _, built = outvin.apply(vin, payload, car['listingId'])
    car['decoded'] = True
    car['keyFeatures'] = built['keyFeatures']
    ch['decoded'].append((car, mdecoder.Result(
        'ok', vin, options=built['options'],
        paint=built['exterior']['german'], paint_code=built['exterior']['code'],
        trim=built['interior']['name'], trim_code=built['interior']['code'])))
    ch['notes'].append(f'outvin: витрачено 1 платний запит, лишилось {ov["available"]}')
    return True


def prune_no_adaptive(index, state, ch):
    """Базові фари — стоп-фактор (рішення користувача 2026-09-03).

    «Немає адаптиву» = у білд-листі немає ні `S552` Adaptive LED, ні `S5AZ`
    Laserlight. Базові LED на M Sport ідуть стандартно й окремим кодом не
    виписуються, тож перекреслений слот `light` означає саме «не адаптивні».
    Причина — нічні поїздки українськими дорогами.

    Перевіряємо ТІЛЬКИ декодованих і тільки коли `keyFeatures` уже є: у
    недекодованих це невідомо, а правило проєкту — «де сумнів, авто лишаємо».
    Прохід іде по всьому списку щоразу, тому ловить і білд-листи, що з'явились
    повз watch.py (`oemnav.py`, `bimmer.py`, ручна вставка).
    """
    bad = state.setdefault('lightRejected', {})
    rejected = state.setdefault('rejected', {})
    keep = []
    for car in index['cars']:
        kf = car.get('keyFeatures')
        if car.get('decoded') and kf and not kf.get('laser') and not kf.get('led'):
            ch['sold'].append((car, 'базові фари — немає ні адаптивного LED (S552), '
                                    'ні лазера (S5AZ)'))
            if car.get('vin'):
                bad[car['vin']] = 'базові фари'
            rejected[car['listingId']] = {'reason': 'базові фари',
                                          'vin': car.get('vin'), 'at': today()}
            continue
        keep.append(car)
    index['cars'] = keep


def keep_raw(res):
    RAW.mkdir(exist_ok=True)
    path = RAW / f'{res.vin}.html'
    path.write_text(res.html, encoding='utf-8')
    return path


def apply_decode(car, res, ch):
    f = CARS / f'{car["listingId"]}.json'
    d = load(f, {'listingId': car['listingId']})
    d['options'] = res.options
    d['keyFeatures'] = mdecoder.key_features([(o['code'], o['desc']) for o in res.options])
    car['keyFeatures'] = d['keyFeatures']      # щоб prune_no_adaptive побачив їх одразу
    if res.paint:
        d['exterior'] = {'name': res.paint, 'german': res.paint, 'code': res.paint_code}
    if res.trim:
        d['interior'] = {'name': res.trim, 'german': res.trim, 'code': res.trim_code}
    save(f, d)
    car['decoded'] = True
    ch['decoded'].append((car, res))


# ------------------------------------------------------------------- 4. звіт

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
    if n['decoded']:
        head.append(f'декодовано {n["decoded"]}')
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
            out.append(f'- **{short(car["model"])} {car["year"]}** · {km(car["mileageKm"])} '
                       f'· було {usd(car["priceUSD"])} — {why}  \n  {car_link(car)}')
        out.append('')
    if ch['new']:
        out += ['## Нові кандидати', '']
        for car in ch['new']:
            acc = car.get('accident') or {}
            hist = ('без ремонтів' if not acc.get('costKRW')
                    else f'ремонт {krw_m(acc["costKRW"])}')
            out.append(f'- **{short(car["model"])} {car["year"]}** · {km(car["mileageKm"])} '
                       f'· {"≈" if car.get("priceEstimated") else ""}{usd(car["priceUSD"])} '
                       f'· {hist} · змін власника {acc.get("owners", 0)}  \n  {car_link(car)}')
        out.append('')
    if ch['decoded']:
        out += ['## Декодовано за VIN', '']
        for car, res in ch['decoded']:
            kf = mdecoder.key_features([(o['code'], o['desc']) for o in res.options])
            have = ', '.join(k for k, v in kf.items() if v) or 'нічого з ключових'
            out.append(f'- **{short(car["model"])} {car["year"]}** · {car["vin"]} — '
                       f'салон **{res.trim or "не розпізнано"}**, кузов {res.paint or "?"}; '
                       f'{len(res.options)} опцій; є: {have}  \n  {car_link(car)}')
        out.append('')
    if ch['vins']:
        out += ['## З\'явився VIN — можна декодувати', '']
        for car in ch['vins']:
            out.append(f'- **{short(car["model"])} {car["year"]}** · {km(car["mileageKm"])} '
                       f'· {usd(car["priceUSD"])} · VIN `{car["vin"]}`  \n  {car_link(car)}')
        out.append('')
    if ch['pending']:
        out += ['## Чекають на білд-лист за VIN', '',
                'Спершу найцікавіші. Декодувати руками: '
                'oemnavigations.com/pages/vin-decoder-app (2 VIN/добу), далі '
                '`python3 tools/oemnav.py <share-url> --write`.', '']
        for car in ch['pending']:
            vin = f'`{car["vin"]}`' if car.get('vin') else '**VIN невідомий**'
            out.append(f'- **{short(car["model"])} {car["year"]}** · {km(car["mileageKm"])} '
                       f'· {usd(car["priceUSD"])} · {vin}  \n  {car_link(car)}')
        out.append('')
    if ch['inspected']:
        out += ['## Додано звіт про стан', '']
        for car, insp in ch['inspected']:
            bits = list(insp.get('usage') or []) + list(insp.get('serious') or [])
            if insp.get('accident'):
                bits.append('ДТП каркаса')
            bits += [f"{p['part']} — {p['status']}" for p in insp.get('panels') or []]
            out.append(f'- **{short(car["model"])} {car["year"]}** · {usd(car["priceUSD"])} — '
                       f'{", ".join(bits) if bits else "звіт чистий"}  \n  {car_link(car)}')
        out.append('')
    if ch['changed']:
        out += ['## Змінилась ціна або пробіг', '']
        for car, old_p, new_p, old_km, new_km in ch['changed']:
            bits = []
            if old_p != new_p:
                bits.append(f'{usd(old_p)} → **{usd(new_p)}**')
            if old_km != new_km:
                bits.append(f'{km(old_km)} → {km(new_km)}')
            out.append(f'- **{short(car["model"])} {car["year"]}** · {" · ".join(bits)}  \n  {car_link(car)}')
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


def publish(title):
    git('add', 'data')
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
    ap.add_argument('--no-decode', action='store_true')
    ap.add_argument('--decode', type=int, default=DECODE_PER_RUN)
    a = ap.parse_args()

    index = load(INDEX, None)
    if index is None:
        sys.exit('немає data/cars.json')
    state = load(STATE, {})
    ch = {'sold': [], 'new': [], 'decoded': [], 'changed': [], 'vins': [],
          'inspected': [], 'problems': [], 'notes': [], 'pending': []}

    check_existing(index, ch)
    find_new(index, state, ch)
    decode_batch(index, state, ch, 0 if a.no_decode else a.decode)
    # Список у листі: що лишилось без білд-листа, найцікавіше згори. Сам по собі
    # він листа НЕ шле (`touched` його не враховує) — їде разом зі справжніми змінами.
    # Без VIN декодувати нічим, тому такі — у кінець списку, а не за ціною.
    prune_no_adaptive(index, state, ch)
    ch['pending'] = sorted((c for c in index['cars'] if not c.get('decoded')),
                           key=lambda c: (not c.get('vin'), promise(c)))

    index['cars'].sort(key=lambda c: c['priceUSD'])
    for i, c in enumerate(index['cars'], 1):
        c['rank'] = i
    index['meta']['updated'] = today()
    index['meta']['count'] = len(index['cars'])
    state['lastRun'] = datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')

    title, body = report(ch)
    touched = any(ch[k] for k in ('sold', 'new', 'decoded', 'changed'))

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
            # Реальні зміни не повторюються (продане зникає, нове додається один
            # раз), тому однаковий звіт означає ту саму невирішену проблему.
            # Не пушимо — інакше issue приходив би щогодини.
            print('звіт не змінився з минулого разу — не публікую')
        else:
            save_md(LAST, body)
            append_md(LOG, body)
            print(publish(title))
    print(title)


def strip_stamp(body: str) -> str:
    """Звіт без останнього рядка з часом перевірки."""
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


if __name__ == '__main__':
    main()
